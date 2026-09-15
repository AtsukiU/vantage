import type { DailyScreenEntry } from "./dailyScreenStore";
import type { Holding } from "./portfolioStore";
import { PERSONA_DEFS, type PersonaId, type PersonaStyle } from "./personaDefs";
import {
  passesFilter,
  candidatesFor,
  managerCandidates,
  convictionMultiplier,
  supportersFor,
  explainFilter,
  explainManager,
  BASE_LABEL_SHORT,
  managerMajorityThreshold,
  activePersonaIds,
  type BasePersonaId,
  type FilterExplanation,
} from "./personaRules";
import { brokerCommissionJpy } from "./brokerFees";

// 実ポートフォリオ(ユーザーの本当の保有銘柄)に対する助言をクライアント側で計算する。
// 架空の資金・仮想口座は使わず、実際の保有株数・評価額・手元資金を基準に「売った方がいい銘柄」
// 「買い候補と推奨株数、今の手元資金で買えるか」を出す。保有データ・手元資金はブラウザの
// localStorageにあるため、この計算はサーバーではなくクライアント側で行う必要がある。

const RISK_PCT = 0.01;
const MAX_POSITION_PCT = 0.2;

export interface SellAdvice {
  ticker: string;
  name: string;
  reason: string;
  detail: FilterExplanation[]; // ホバー時に出す内訳(どの条件を満たさなくなったか)
  estimatedFeeJpy: number; // SBI証券想定の売却手数料(円換算、国内株は¥0)
}

export interface BuyAdvice {
  ticker: string;
  name: string | null;
  reason: string;
  detail: FilterExplanation[]; // ホバー時に出す内訳(どの条件を満たして選ばれたか)
  entryPrice: number;
  currency: string;
  suggestedShares: number;
  suggestedValueJpy: number;
  estimatedFeeJpy: number; // SBI証券想定の購入手数料(円換算、国内株は¥0)
  affordableNow: boolean; // 現在の手元資金(availableCashJpy)で手数料込みで買えるか
}

export interface PersonaAdvice {
  personaId: PersonaId;
  sells: SellAdvice[];
  buys: BuyAdvice[];
}

function explainFor(def: (typeof PERSONA_DEFS)[number], e: DailyScreenEntry): FilterExplanation[] {
  return def.isManager ? explainManager(e) : explainFilter(def.id as BasePersonaId, e);
}

export function computePortfolioAdvice(
  pool: DailyScreenEntry[],
  holdings: Holding[],
  priceByTicker: Map<string, { price: number | null; currency: string | null }>,
  usdJpy: number,
  availableCashJpy: number,
  style?: PersonaStyle | null
): { advice: PersonaAdvice[]; portfolioValueJpy: number } {
  const poolMap = new Map(pool.map((e) => [e.ticker, e]));
  const heldTickers = new Set(holdings.map((h) => h.ticker));
  const activeIds = activePersonaIds(style);
  const majorityThreshold = managerMajorityThreshold(activeIds.length);

  let holdingsValueJpy = 0;
  for (const h of holdings) {
    const info = priceByTicker.get(h.ticker);
    const price = info?.price ?? h.avgCost;
    const currency = info?.currency ?? h.currency;
    holdingsValueJpy += currency === "USD" ? price * h.shares * usdJpy : price * h.shares;
  }
  // サイジングの基準は「保有評価額+手元資金」の総資産(現金だけの人でも助言が出るように)
  const totalAssetsJpy = holdingsValueJpy + availableCashJpy;

  const advice = PERSONA_DEFS.map((def) => {
    // 売り推奨: 保有銘柄のうち、このパーソナがもう支持していないもの
    const sells: SellAdvice[] = [];
    for (const h of holdings) {
      const latest = poolMap.get(h.ticker);
      if (!latest) continue; // 本日のスキャン対象外の銘柄は判定できない
      const stillSupported = def.isManager
        ? supportersFor(latest, activeIds).length >= majorityThreshold
        : passesFilter(def.id as BasePersonaId, latest);
      if (!stillSupported) {
        const priceNow = latest.price ?? h.avgCost;
        sells.push({
          ticker: h.ticker,
          name: h.name,
          reason: def.isManager ? "支持者が過半数を下回った" : "エントリー条件を満たさなくなった",
          detail: explainFor(def, latest),
          estimatedFeeJpy: Math.round(brokerCommissionJpy(priceNow * h.shares, h.currency, usdJpy)),
        });
      }
    }

    // 買い推奨: このパーソナが新規に支持する銘柄(既保有は除く)
    const rawCandidates = def.isManager
      ? managerCandidates(pool, heldTickers, activeIds).map(({ entry, supporters }) => ({
          entry,
          reason: `合議採用(${supporters.map((s) => BASE_LABEL_SHORT[s]).join("・")}が支持)`,
        }))
      : candidatesFor(def.id as BasePersonaId, pool, heldTickers).map((entry) => ({ entry, reason: `新規候補(${def.label})` }));

    const buys: BuyAdvice[] = [];
    if (totalAssetsJpy > 0) {
      for (const cand of rawCandidates.slice(0, def.maxNewEntriesPerDay)) {
        const entryPrice = cand.entry.price;
        if (!entryPrice || !cand.entry.currency) continue;
        const stopPrice = entryPrice * (1 + def.stopLossPct / 100);
        const riskPerShare = entryPrice - stopPrice;
        if (riskPerShare <= 0) continue;

        const conviction = convictionMultiplier(cand.entry);
        const riskBudgetJpy = Math.min(totalAssetsJpy * RISK_PCT * conviction, totalAssetsJpy * MAX_POSITION_PCT);
        const riskBudgetNative = cand.entry.currency === "USD" ? riskBudgetJpy / usdJpy : riskBudgetJpy;
        const shares = Math.floor(riskBudgetNative / riskPerShare);
        if (shares <= 0) continue;

        const valueJpy = cand.entry.currency === "USD" ? shares * entryPrice * usdJpy : shares * entryPrice;
        const feeJpy = brokerCommissionJpy(shares * entryPrice, cand.entry.currency, usdJpy);
        buys.push({
          ticker: cand.entry.ticker,
          name: cand.entry.name,
          reason: cand.reason,
          detail: explainFor(def, cand.entry),
          entryPrice,
          currency: cand.entry.currency,
          suggestedShares: shares,
          suggestedValueJpy: Math.round(valueJpy),
          estimatedFeeJpy: Math.round(feeJpy),
          affordableNow: valueJpy + feeJpy <= availableCashJpy,
        });
      }
    }

    return { personaId: def.id, sells, buys };
  });

  return { advice, portfolioValueJpy: Math.round(holdingsValueJpy) };
}
