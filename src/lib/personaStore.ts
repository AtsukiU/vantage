import fs from "fs";
import path from "path";
import { getJson, setJson, isKvConfigured } from "./kv";
import { brokerCommissionJpy } from "./brokerFees";
import { getDailyScreenState, type DailyScreenEntry, type ScreenMarket } from "./dailyScreenStore";
import { computeOverallScore } from "./dailyPickOverall";
import { fetchStockMetrics } from "./stockMetrics";
import { convictionMultiplier, candidatesFor, managerCandidates, BASE_LABEL_SHORT, supportersFor, type BasePersonaId } from "./personaRules";
import {
  PERSONA_DEFS,
  STARTING_CASH_JPY,
  type PersonaId,
  type PersonaHolding,
  type PersonaAccount,
  type PersonasFile,
} from "./personaDefs";

// 「運用者」シミュレーション(検証用): 各パーソナのルールに従った場合の仮想運用成績を
// 記録し続けるサーバー専用ロジック。実際の売買は一切行わない(架空の口座・架空の資金)。
// 「本日の注目銘柄」の日次フルスキャン結果を使い、ユーザーがボタンを押すたびに全パーソナの
// 決済・エントリー判定をやり直す。メインの用途は「このルールに従い続けたら実際どうなるか」を
// 検証すること(実ポートフォリオへの助言はportfolioAdvice.tsが別途クライアント側で行う)。
// 銘柄選定ロジック本体はpersonaRules.tsに分離し、助言側と共有している。

const RISK_PCT = 0.01; // 現在の評価額の1%を基準リスクとする(確信度でこれを上下させる)
const MAX_POSITION_PCT = 0.2; // 1銘柄あたり評価額の20%まで

const CACHE_DIR = path.join(process.cwd(), ".data");
const FILE_PATH = path.join(CACHE_DIR, "personas.json");

function todayJst(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function emptyAccount(id: PersonaId): PersonaAccount {
  return { id, cashJPY: STARTING_CASH_JPY, holdings: [], trades: [], equityHistory: [] };
}

function emptyFile(): PersonasFile {
  const accounts = {} as Record<PersonaId, PersonaAccount>;
  for (const def of PERSONA_DEFS) accounts[def.id] = emptyAccount(def.id);
  return { lastRunDate: null, lastRunAt: null, usdJpy: 150, accounts };
}

function normalize(parsed: PersonasFile | null): PersonasFile {
  if (!parsed || !parsed.accounts) return emptyFile();
  // 新しいパーソナが追加された後に保存された古いファイルとの互換用: 足りない口座を補う
  for (const def of PERSONA_DEFS) {
    if (!parsed.accounts[def.id]) parsed.accounts[def.id] = emptyAccount(def.id);
  }
  if (parsed.lastRunAt === undefined) parsed.lastRunAt = null;
  return parsed;
}

const KV_KEY = "personas";

// Upstash Redisが設定されていればそちらを使い、未設定時は従来通りローカルディスクへ
// フォールバックする(dailyScreenStore.tsと同じ考え方)。
async function loadFile(): Promise<PersonasFile> {
  try {
    if (isKvConfigured()) {
      const parsed = await getJson<PersonasFile>(KV_KEY);
      return normalize(parsed);
    }
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    return normalize(JSON.parse(raw) as PersonasFile);
  } catch {
    return emptyFile();
  }
}

async function saveFile(state: PersonasFile): Promise<void> {
  // 取引履歴が無限に増えないよう直近200件に制限する
  for (const id of Object.keys(state.accounts) as PersonaId[]) {
    const acc = state.accounts[id];
    if (acc.trades.length > 200) acc.trades = acc.trades.slice(-200);
  }
  try {
    if (isKvConfigured()) {
      await setJson(KV_KEY, state);
      return;
    }
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(FILE_PATH, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to persist persona state", e);
  }
}

export async function getPersonasState(): Promise<PersonasFile> {
  return loadFile();
}

function toJpy(amountNative: number, currency: string, usdJpy: number): number {
  if (currency === "USD") return amountNative * usdJpy;
  return amountNative; // JPYおよびそれ以外は円建てとみなす(現状JP/USのみ対応)
}

function accountEquityJpy(acc: PersonaAccount, pool: Map<string, DailyScreenEntry>, usdJpy: number): number {
  let value = acc.cashJPY;
  for (const h of acc.holdings) {
    const latest = pool.get(h.ticker);
    const price = latest?.price ?? h.entryPrice;
    value += toJpy(price * h.shares, h.currency, usdJpy);
  }
  return value;
}

// 決済ルール: 損切り/利確に加え、パーソナごとの「シグナルが崩れたら降りる」条件も見る。
function exitReasonFor(id: PersonaId, h: PersonaHolding, latest: DailyScreenEntry | undefined): string | null {
  if (!latest || latest.price == null) return null;
  const price = latest.price;
  if (price <= h.stopLoss) return "損切り";
  if (price >= h.takeProfit) return "利確";
  if (id === "committee") {
    // エントリー基準(ROE15%以上・PER20倍以下)より緩く取り、小さな変動での頻繁な入れ替わりを避ける。
    if (latest.roe != null && latest.roe < 8) return "ROEの低下(質の悪化)";
    if (latest.per != null && latest.per > 30) return "PERの割高化";
  }
  if (id === "value") {
    // エントリー基準(グレアム指数5.0以下)より緩く取り、小さな変動での頻繁な入れ替わりを避ける。
    if (latest.per != null && latest.pbr != null && latest.per > 0 && latest.pbr > 0 && latest.per * latest.pbr > 10) {
      return "グレアム指数の割高化(割安さの消失)";
    }
  }
  if (id === "growth") {
    if (latest.earningsGrowth != null && latest.earningsGrowth < 0) return "利益成長の鈍化";
    const peg = latest.per != null && latest.earningsGrowth != null && latest.earningsGrowth > 0 ? latest.per / latest.earningsGrowth : null;
    if (peg != null && peg > 3) return "PEGレシオの割高化";
  }
  if (id === "risk") {
    if (latest.qualityScore != null && latest.qualityTotal > 0 && latest.qualityScore / latest.qualityTotal < 0.6) {
      return "財務健全性の悪化";
    }
    if (latest.committeeAgree != null && latest.committeeTotal != null && latest.committeeTotal > 0 && latest.committeeAgree / latest.committeeTotal < 0.4) {
      return "委員会の賛成低下";
    }
  }
  if (id === "income") {
    if (latest.dividendYield != null && latest.dividendYield < 1.5) return "配当利回りの低下";
    if (latest.qualityScore != null && latest.qualityTotal > 0 && latest.qualityScore / latest.qualityTotal < 0.5) {
      return "財務健全性の悪化(減配リスク)";
    }
  }
  if (id === "event") {
    const { grade } = computeOverallScore(latest);
    if (grade === "C" || grade === "D") return "総合評価の低下";
  }
  if (id === "manager") {
    if (supportersFor(latest).length === 0) return "支持の消失(全員が支持を外した)";
  }
  return null;
}

interface DayContext {
  date: string;
  pool: DailyScreenEntry[];
  poolMap: Map<string, DailyScreenEntry>;
  jpResults: DailyScreenEntry[];
  usdJpy: number;
}

// 1パーソナ分、1日分の決済判定→エントリー判定を行い、口座を直接更新する。
function processPersonaForDay(def: (typeof PERSONA_DEFS)[number], acc: PersonaAccount, ctx: DayContext): void {
  const { date, pool, poolMap, jpResults, usdJpy } = ctx;

  // 1. 決済判定
    const remaining: PersonaHolding[] = [];
    for (const h of acc.holdings) {
      const latest = poolMap.get(h.ticker);
      const reason = exitReasonFor(def.id, h, latest);
      if (reason && latest?.price != null) {
        const sellFeeJpy = brokerCommissionJpy(latest.price * h.shares, h.currency, usdJpy);
        const proceedsJpy = toJpy(latest.price * h.shares, h.currency, usdJpy) - sellFeeJpy;
        const costJpy = toJpy(h.entryPrice * h.shares, h.currency, usdJpy) + (h.entryFeeJPY ?? 0);
        acc.cashJPY += proceedsJpy;
        acc.trades.push({
          date,
          ticker: h.ticker,
          name: h.name,
          market: h.market,
          side: "sell",
          price: latest.price,
          shares: h.shares,
          reason,
          plJPY: Math.round(proceedsJpy - costJpy),
        });
      } else {
        remaining.push(h);
      }
    }
    acc.holdings = remaining;

    // 2. エントリー判定(managerは他3人の合議、それ以外は自分のルール)
    const held = new Set(acc.holdings.map((h) => h.ticker));
    const equity = accountEquityJpy(acc, poolMap, usdJpy);
    const candidates: { entry: DailyScreenEntry; reason: string }[] = def.isManager
      ? managerCandidates(pool, held).map(({ entry, supporters }) => ({
          entry,
          reason: `合議採用(${supporters.map((s) => BASE_LABEL_SHORT[s]).join("・")}が支持)`,
        }))
      : candidatesFor(def.id as BasePersonaId, pool, held).map((entry) => ({
          entry,
          reason: `新規エントリー(総合${computeOverallScore(entry).grade})`,
        }));

    let newEntries = 0;
    for (const cand of candidates) {
      if (newEntries >= def.maxNewEntriesPerDay) break;
      if (acc.holdings.length >= def.maxHoldings) break;
      const candEntry = cand.entry;
      if (!candEntry.price || !candEntry.currency) continue;

      const entry = candEntry.price;
      const stop = Math.round(entry * (1 + def.stopLossPct / 100) * 100) / 100;
      const target = Math.round(entry * (1 + def.takeProfitPct / 100) * 100) / 100;
      const riskPerShareNative = entry - stop;
      if (riskPerShareNative <= 0) continue;

      const conviction = convictionMultiplier(candEntry);
      const riskBudgetJpy = Math.min(equity * RISK_PCT * conviction, equity * MAX_POSITION_PCT);
      const riskBudgetNative = candEntry.currency === "USD" ? riskBudgetJpy / usdJpy : riskBudgetJpy;
      let shares = Math.floor(riskBudgetNative / riskPerShareNative);

      const cashNative = candEntry.currency === "USD" ? acc.cashJPY / usdJpy : acc.cashJPY;
      const maxSharesByCash = Math.floor(cashNative / entry);
      shares = Math.min(shares, maxSharesByCash);
      if (shares <= 0) continue;

      const candMarket: ScreenMarket = jpResults.includes(candEntry) ? "jp" : "us";
      const entryFeeJpy = brokerCommissionJpy(shares * entry, candEntry.currency, usdJpy);
      const costJpy = toJpy(shares * entry, candEntry.currency, usdJpy) + entryFeeJpy;
      acc.cashJPY -= costJpy;
      acc.holdings.push({
        ticker: candEntry.ticker,
        name: candEntry.name,
        market: candMarket,
        currency: candEntry.currency,
        shares,
        entryPrice: entry,
        entryDate: date,
        stopLoss: stop,
        takeProfit: target,
        entryFeeJPY: Math.round(entryFeeJpy),
      });
      acc.trades.push({ date, ticker: candEntry.ticker, name: candEntry.name, market: candMarket, side: "buy", price: entry, shares, reason: cand.reason });
      newEntries++;
    }

  const finalEquity = accountEquityJpy(acc, poolMap, usdJpy);
  // 同じ日に複数回ボタンを押しても資産推移グラフが重複しないよう、当日分は上書きする
  const last = acc.equityHistory[acc.equityHistory.length - 1];
  if (last && last.date === date) {
    last.valueJPY = Math.round(finalEquity);
  } else {
    acc.equityHistory.push({ date, valueJPY: Math.round(finalEquity) });
  }
}

export type PersonaRunResult =
  | { ok: true; state: PersonasFile }
  | { ok: false; reason: "scan_not_ready"; state: PersonasFile };

// ユーザーが「運用者」タブでボタンを押した時に呼ぶ。1日1回の自動判断ではなく、
// 押すたびに現時点で取得済みの「本日の注目銘柄」(JP/US)を使って全パーソナの
// 決済・エントリー判定をやり直す(判定ロジック自体は同じデータに対して冪等 —
// 既に保有・既に決済済みの銘柄を二重に売買することはない)。
export async function runPersonasNow(): Promise<PersonaRunResult> {
  const date = todayJst();
  const state = await loadFile();

  const jpState = await getDailyScreenState("jp");
  const usState = await getDailyScreenState("us");
  if (jpState.date !== date || jpState.status !== "done" || usState.date !== date || usState.status !== "done") {
    // 本日分のスキャンが両方完了していない場合は判断を行わない
    return { ok: false, reason: "scan_not_ready", state };
  }

  const pool: DailyScreenEntry[] = [...jpState.results, ...usState.results];
  const poolMap = new Map(pool.map((e) => [e.ticker, e]));

  const fx = await fetchStockMetrics("JPY=X").catch(() => null);
  const usdJpy = fx?.price ?? state.usdJpy ?? 150;

  const ctx: DayContext = { date, pool, poolMap, jpResults: jpState.results, usdJpy };
  for (const def of PERSONA_DEFS) {
    processPersonaForDay(def, state.accounts[def.id], ctx);
  }

  state.lastRunDate = date;
  state.lastRunAt = new Date().toISOString();
  state.usdJpy = usdJpy;
  await saveFile(state);
  return { ok: true, state };
}
