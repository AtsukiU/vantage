import fs from "fs";
import path from "path";
import { getJson, setJson, isKvConfigured } from "./kv";
import { getPrimeMarketTickers } from "./jpListedDirectory";
import { getSp500Tickers } from "./usListedDirectory";
import { computeStockScores } from "./computeStockScores";
import type { CommitteeVerdict } from "./committeeScore";
import {
  MINERVINI_TOTAL,
  CANSLIM_TOTAL,
  QUALITY_TOTAL,
  FUNDAMENTAL_ROLE_TOTAL,
  SENTIMENT_ROLE_TOTAL,
  MACRO_ROLE_TOTAL,
} from "./dailyPickOverall";

// 「本日の注目銘柄」: 東証プライム市場(約1,550社)またはS&P500(約500社)を1日1回フルスキャンし、
// ミネルヴィニ/CANSLIM/財務健全性/投資委員会各役のスコアを一括計算してキャッシュする。
// ローカル単一プロセスのNext.js開発サーバー前提のシンプルな実装(インメモリの実行状態+
// ディスク上のJSONキャッシュ)。銘柄詳細ページの都度計算とは違い、重い処理を1日1回にまとめて
// 「開いたら結果がすぐ見られる」体験にするための仕組み。日本株・米国株は別々に状態を持つ。

export type ScreenMarket = "jp" | "us";

export interface DailyScreenEntry {
  ticker: string;
  name: string | null;
  sector: string | null;
  price: number | null;
  currency: string | null;
  dayChangePercent: number | null;
  minerviniScore: number | null;
  minerviniTotal: number;
  canslimScore: number | null;
  canslimTotal: number;
  qualityScore: number | null;
  qualityTotal: number;
  fundamentalRoleScore: number | null;
  fundamentalRoleTotal: number;
  sentimentRoleScore: number | null;
  sentimentRoleTotal: number;
  macroRoleScore: number | null;
  macroRoleTotal: number;
  committeeAgree: number | null;
  committeeTotal: number | null;
  // 各役(ファンダメンタル/テクニカル/センチメント/リスク管理/マクロ)の賛成/反対内訳。
  // ホバー時の理由表示用(pmは実ポートフォリオが必要なためサーバー側では常にnull)。
  committeeRoles: CommitteeVerdict["roles"] | null;
  relativeStrengthPct: number | null;
  // その日のスキャン対象全体の中での相対力パーセンタイル順位(0-100、高いほど強い)。
  // 全銘柄のスコアが揃った後でないと算出できないため、スキャン完了時にまとめて計算する。
  rsPercentile: number | null;
  dividendYield: number | null; // % (インカム役の判定に使う)
  earningsDate: string | null; // 次回決算発表予定日(ISO date、イベント警戒役の判定に使う)
  volumeRatio: number | null; // 出来高が平均の何倍か(CANSLIMの出来高急増判定に使う)
  priceVs50ma: number | null; // % (50日移動平均線からの乖離)
  priceVs200ma: number | null; // % (200日移動平均線からの乖離、逆張り判定に使う)
  // 以下は投資家スタイル別パーソナ(グレアム型・グリーンブラット型・リンチ型)の判定用。
  // スキャン時に取得済みのStockMetricsからそのまま転記するだけで、追加のAPI呼び出しは発生しない。
  per: number | null;
  pbr: number | null;
  roe: number | null; // %
  debtToEquity: number | null; // %
  currentRatio: number | null;
  revenueGrowth: number | null; // %
  earningsGrowth: number | null; // %
}

export interface DailyScreenState {
  market: ScreenMarket;
  date: string; // YYYY-MM-DD(JST)
  status: "idle" | "running" | "done" | "error";
  progress: { done: number; total: number };
  results: DailyScreenEntry[];
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

// 分母定数はdailyPickOverall.ts側で定義している(このファイルはfsに依存するサーバー専用のため、
// クライアントコンポーネントから定数だけを安全にimportできるよう、依存の無いファイルに置く)。

const CACHE_DIR = path.join(process.cwd(), ".data");

function todayJst(): string {
  // JSTで日付を出す(サーバーのタイムゾーンに依存しないように+9時間オフセットで計算)。
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function cacheFilePath(market: ScreenMarket, date: string): string {
  return path.join(CACHE_DIR, `daily-screen-${market}-${date}.json`);
}

function cacheKvKey(market: ScreenMarket, date: string): string {
  return `daily-screen:${market}:${date}`;
}

function emptyState(market: ScreenMarket, date: string): DailyScreenState {
  return { market, date, status: "idle", progress: { done: 0, total: 0 }, results: [], startedAt: null, finishedAt: null, error: null };
}

const states = new Map<ScreenMarket, DailyScreenState>([
  ["jp", emptyState("jp", todayJst())],
  ["us", emptyState("us", todayJst())],
]);

// Upstash Redis(環境変数UPSTASH_REDIS_REST_URL/TOKEN)が設定されていればそちらを
// 永続化先として使う(複数の常時起動サーバーインスタンス間・再デプロイ後も共有できる)。
// 未設定時は従来通りローカルディスク(.data/)へフォールバックする(ローカル開発時に
// Upstashアカウントを必須にしないため)。
async function loadFromDiskIfNewer(market: ScreenMarket): Promise<void> {
  const date = todayJst();
  const state = states.get(market)!;
  if (state.date === date && (state.status === "done" || state.status === "running")) return;
  try {
    if (isKvConfigured()) {
      const parsed = await getJson<DailyScreenState>(cacheKvKey(market, date));
      if (parsed && parsed.date === date) {
        states.set(market, parsed);
        return;
      }
      if (state.date !== date) states.set(market, emptyState(market, date));
      return;
    }
    const raw = fs.readFileSync(cacheFilePath(market, date), "utf-8");
    const parsed = JSON.parse(raw) as DailyScreenState;
    if (parsed.date === date) states.set(market, parsed);
  } catch {
    if (state.date !== date) states.set(market, emptyState(market, date));
  }
}

async function persistToDisk(market: ScreenMarket): Promise<void> {
  const state = states.get(market)!;
  try {
    if (isKvConfigured()) {
      await setJson(cacheKvKey(market, state.date), state);
      return;
    }
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFilePath(market, state.date), JSON.stringify(state));
  } catch (e) {
    console.error("Failed to persist daily screen cache", e);
  }
}

export async function getDailyScreenState(market: ScreenMarket): Promise<DailyScreenState> {
  await loadFromDiskIfNewer(market);
  return states.get(market)!;
}

const CONCURRENCY = 6;

// relativeStrengthPctが算出できた銘柄だけを対象に、その日のスキャン結果全体の中での
// パーセンタイル順位(0-100、高いほど相対的に強い)を計算してentries自体に書き込む。
// 算出不可(null)の銘柄はrsPercentileもnullのまま。
function assignRsPercentiles(entries: DailyScreenEntry[]): void {
  const withRs = entries.filter((e): e is DailyScreenEntry & { relativeStrengthPct: number } => e.relativeStrengthPct != null);
  const sorted = [...withRs].sort((a, b) => a.relativeStrengthPct - b.relativeStrengthPct);
  const n = sorted.length;
  sorted.forEach((e, rank) => {
    e.rsPercentile = n <= 1 ? 100 : Math.round((rank / (n - 1)) * 100);
  });
}

async function runScan(market: ScreenMarket): Promise<void> {
  const date = todayJst();
  const universe = market === "jp" ? getPrimeMarketTickers() : getSp500Tickers();
  states.set(market, {
    market,
    date,
    status: "running",
    progress: { done: 0, total: universe.length },
    results: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  });

  const results: DailyScreenEntry[] = [];
  let idx = 0;
  let done = 0;

  async function worker() {
    while (idx < universe.length) {
      const i = idx++;
      const { ticker } = universe[i];
      try {
        const scores = await computeStockScores(ticker);
        if (!scores.metrics.error) {
          results.push({
            ticker,
            name: scores.metrics.name,
            sector: scores.metrics.sector,
            price: scores.metrics.price,
            currency: scores.metrics.currency,
            dayChangePercent: scores.metrics.dayChangePercent,
            minerviniScore: scores.minerviniScore,
            minerviniTotal: MINERVINI_TOTAL,
            canslimScore: scores.canslimScore,
            canslimTotal: CANSLIM_TOTAL,
            qualityScore: scores.qualityScore,
            // 金融セクターは自己資本比率の項目が除外され8点満点になるため、固定値ではなく
            // 実際に計算された分母を使う(以前は常にQUALITY_TOTAL=9固定で、銀行・保険株の
            // スコアが実質1点分不利に表示される/リスク管理型の80%閾値判定を誤る原因になっていた)。
            qualityTotal: scores.qualityTotal ?? QUALITY_TOTAL,
            fundamentalRoleScore: scores.fundamentalRoleScore,
            fundamentalRoleTotal: FUNDAMENTAL_ROLE_TOTAL,
            sentimentRoleScore: scores.sentimentRoleScore,
            sentimentRoleTotal: SENTIMENT_ROLE_TOTAL,
            macroRoleScore: scores.macroRoleScore,
            macroRoleTotal: MACRO_ROLE_TOTAL,
            committeeAgree: scores.committeeAgree,
            committeeTotal: scores.committeeTotal,
            committeeRoles: scores.committeeRoles,
            relativeStrengthPct: scores.relativeStrengthPct,
            rsPercentile: null, // スキャン完了後にまとめて算出する
            dividendYield: scores.metrics.dividendYield,
            earningsDate: scores.metrics.earningsDate,
            volumeRatio: scores.metrics.volumeRatio,
            priceVs50ma: scores.metrics.priceVs50ma,
            priceVs200ma: scores.metrics.priceVs200ma,
            per: scores.metrics.per,
            pbr: scores.metrics.pbr,
            roe: scores.metrics.roe,
            debtToEquity: scores.metrics.debtToEquity,
            currentRatio: scores.metrics.currentRatio,
            revenueGrowth: scores.metrics.revenueGrowth,
            earningsGrowth: scores.metrics.earningsGrowth,
          });
        }
      } catch {
        // 1銘柄の失敗でスキャン全体を止めない
      } finally {
        done++;
        const current = states.get(market)!;
        current.progress = { done, total: universe.length };
        // 100銘柄ごとに中間結果をディスクへ保存(長時間処理の途中でサーバーが
        // 再起動しても、直近の結果はある程度残るようにする)。
        if (done % 100 === 0) {
          current.results = [...results];
          void persistToDisk(market);
        }
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, universe.length) }, worker));
    assignRsPercentiles(results);
    const current = states.get(market)!;
    states.set(market, { ...current, status: "done", results, finishedAt: new Date().toISOString() });
  } catch (e) {
    const current = states.get(market)!;
    states.set(market, { ...current, status: "error", error: e instanceof Error ? e.message : "スキャンに失敗しました" });
  }
  await persistToDisk(market);
}

// startDailyScreen()呼び出し中(loadFromDiskIfNewerのawait待ち)の市場を記録しておくロック。
// 例えばDailyScanBannerとDailyPicksTabをほぼ同時に開いた場合など、同じ市場へのstart呼び出しが
// 重なると、両方ともawaitの手前では「まだrunning/done状態ではない」ように見えてしまい、
// 両方ともrunScanを二重起動してしまう(結果が上書き合いになり通信量も倍になる)。
// このSetへのadd/deleteはawaitを挟まない同期処理なので、後発の呼び出しは確実に先発の
// ロックを見てスキップできる。
const startingLocks = new Set<ScreenMarket>();

// 既に本日分が実行中/完了済みならスキップし、そうでなければバックグラウンドで開始する。
// forceRestart=trueなら完了済み/実行中でも本日分を破棄して再スキャンする。
export async function startDailyScreen(market: ScreenMarket, forceRestart = false): Promise<DailyScreenState> {
  // ロックはforce指定でも素通りさせない(「今まさに別の呼び出しが起動処理中」を防ぐためのもので、
  // forceの意味である「完了済み/実行中でも破棄して良い」とは別の話のため)。
  if (startingLocks.has(market)) return states.get(market)!;
  startingLocks.add(market);
  try {
    await loadFromDiskIfNewer(market);
    const state = states.get(market)!;
    // force=trueなら"running"のままでも再スタートできるようにする(サーバー再起動を挟むと、
    // 実際には動いていないワーカーの"running"状態だけがディスクから復元されて固まって見える
    // ことがあるため、これがユーザー側の唯一の回復手段になる)。
    if (state.status === "running" && !forceRestart) return state;
    if (state.status === "done" && !forceRestart) return state;

    // 呼び出し元(APIルート)をブロックしないよう、awaitせずバックグラウンドで実行する。
    void runScan(market);
    return states.get(market)!;
  } finally {
    startingLocks.delete(market);
  }
}
