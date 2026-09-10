import { fetchYahooAuthenticated, num, type RawNum } from "./stockMetrics";

// 「他の投資家が実際に何を見ているか」系のシグナルをまとめて取得する。
// インサイダー売買・機関投資家保有動向・空売り比率・アナリスト格上げ/格下げの勢い・決算サプライズ実績。
// いずれも1回のquoteSummary呼び出しでまとめて取れるので、詳細ページ用に1つのモジュールにまとめている。

export interface InsiderTransaction {
  filerName: string;
  filerRelation: string;
  transactionText: string;
  shares: number | null;
  value: number | null;
  date: string | null;
}

export interface InstitutionalHolder {
  organization: string;
  pctHeld: number | null; // %
  pctChange: number | null; // %
  value: number | null;
}

export interface AnalystAction {
  date: string | null;
  firm: string;
  toGrade: string;
  fromGrade: string;
  action: string; // up/down/main/init/reit
}

export interface EarningsSurprise {
  quarter: string | null;
  epsActual: number | null;
  epsEstimate: number | null;
  surprisePercent: number | null; // %
}

export interface StockSignals {
  insiderTransactions: InsiderTransaction[];
  netInsiderBuyShares: number | null;
  netInsiderSellShares: number | null;
  insidersPercentHeld: number | null; // %
  institutionalHolders: InstitutionalHolder[];
  institutionsPercentHeld: number | null; // %
  institutionsCount: number | null;
  netInstitutionalBuyingPercent: number | null; // %
  sharesShort: number | null;
  sharesShortPriorMonth: number | null;
  shortRatio: number | null; // 日数(出来高に対する空売り残の日数)
  shortPercentOfFloat: number | null; // %
  dateShortInterest: string | null;
  analystActions: AnalystAction[];
  upgrades90d: number;
  downgrades90d: number;
  earningsSurprises: EarningsSurprise[];
  beatStreak: number; // 直近から連続して予想EPSを上回った四半期数
}

export const EMPTY_STOCK_SIGNALS: StockSignals = {
  insiderTransactions: [],
  netInsiderBuyShares: null,
  netInsiderSellShares: null,
  insidersPercentHeld: null,
  institutionalHolders: [],
  institutionsPercentHeld: null,
  institutionsCount: null,
  netInstitutionalBuyingPercent: null,
  sharesShort: null,
  sharesShortPriorMonth: null,
  shortRatio: null,
  shortPercentOfFloat: null,
  dateShortInterest: null,
  analystActions: [],
  upgrades90d: 0,
  downgrades90d: 0,
  earningsSurprises: [],
  beatStreak: 0,
};

interface RawInsiderTx {
  filerName?: string;
  filerRelation?: string;
  transactionText?: string;
  shares?: RawNum;
  value?: RawNum;
  startDate?: RawNum;
}
interface RawHolder {
  organization?: string;
  pctHeld?: RawNum;
  pctChange?: RawNum;
  value?: RawNum;
}
interface RawGrade {
  epochGradeDate?: number;
  firm?: string;
  toGrade?: string;
  fromGrade?: string;
  action?: string;
}
interface RawEarnings {
  quarter?: RawNum;
  epsActual?: RawNum;
  epsEstimate?: RawNum;
  surprisePercent?: RawNum;
}

interface QuoteSummaryResult {
  insiderTransactions?: { transactions?: RawInsiderTx[] };
  netSharePurchaseActivity?: {
    buyInfoShares?: RawNum;
    sellInfoShares?: RawNum;
    netInstBuyingPercent?: RawNum;
  };
  majorHoldersBreakdown?: {
    insidersPercentHeld?: RawNum;
    institutionsPercentHeld?: RawNum;
    institutionsCount?: RawNum;
  };
  institutionOwnership?: { ownershipList?: RawHolder[] };
  defaultKeyStatistics?: {
    sharesShort?: RawNum;
    sharesShortPriorMonth?: RawNum;
    shortRatio?: RawNum;
    shortPercentOfFloat?: RawNum;
    dateShortInterest?: RawNum;
  };
  upgradeDowngradeHistory?: { history?: RawGrade[] };
  earningsHistory?: { history?: RawEarnings[] };
}

function unixToIsoDate(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function pct(v: RawNum): number | null {
  const n = num(v);
  return n == null ? null : Math.round(n * 1000) / 10;
}

const MODULES = [
  "insiderTransactions",
  "netSharePurchaseActivity",
  "majorHoldersBreakdown",
  "institutionOwnership",
  "defaultKeyStatistics",
  "upgradeDowngradeHistory",
  "earningsHistory",
].join(",");

export async function fetchStockSignals(ticker: string): Promise<StockSignals> {
  const res = await fetchYahooAuthenticated(
    (crumb) =>
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
        ticker
      )}?modules=${MODULES}&formatted=false&crumb=${encodeURIComponent(crumb)}`
  );
  if (!res.ok) return EMPTY_STOCK_SIGNALS;

  const json = await res.json();
  const result = (json?.quoteSummary?.result?.[0] as QuoteSummaryResult | undefined) ?? null;
  if (!result) return EMPTY_STOCK_SIGNALS;

  const insiderTransactions = (result.insiderTransactions?.transactions ?? [])
    .filter((t) => t.transactionText)
    .slice(0, 8)
    .map(
      (t): InsiderTransaction => ({
        filerName: t.filerName ?? "",
        filerRelation: t.filerRelation ?? "",
        transactionText: t.transactionText ?? "",
        shares: num(t.shares),
        value: num(t.value),
        date: unixToIsoDate(num(t.startDate)),
      })
    );

  const netActivity = result.netSharePurchaseActivity ?? {};
  const majorHolders = result.majorHoldersBreakdown ?? {};
  const keyStats = result.defaultKeyStatistics ?? {};

  const institutionalHolders = (result.institutionOwnership?.ownershipList ?? [])
    .slice(0, 5)
    .map(
      (h): InstitutionalHolder => ({
        organization: h.organization ?? "",
        pctHeld: pct(h.pctHeld),
        pctChange: pct(h.pctChange),
        value: num(h.value),
      })
    );

  const now = Date.now();
  const days90 = 90 * 24 * 3600 * 1000;
  const analystActions = (result.upgradeDowngradeHistory?.history ?? [])
    .slice(0, 15)
    .map(
      (g): AnalystAction => ({
        date: unixToIsoDate(g.epochGradeDate ?? null),
        firm: g.firm ?? "",
        toGrade: g.toGrade ?? "",
        fromGrade: g.fromGrade ?? "",
        action: g.action ?? "",
      })
    );
  let upgrades90d = 0;
  let downgrades90d = 0;
  for (const g of result.upgradeDowngradeHistory?.history ?? []) {
    if (g.epochGradeDate == null || now - g.epochGradeDate * 1000 > days90) continue;
    if (g.action === "up") upgrades90d++;
    else if (g.action === "down") downgrades90d++;
  }

  const earningsSurprises = (result.earningsHistory?.history ?? []).map(
    (e): EarningsSurprise => ({
      quarter: unixToIsoDate(num(e.quarter)),
      epsActual: num(e.epsActual),
      epsEstimate: num(e.epsEstimate),
      surprisePercent: pct(e.surprisePercent),
    })
  );
  let beatStreak = 0;
  for (let i = earningsSurprises.length - 1; i >= 0; i--) {
    const s = earningsSurprises[i].surprisePercent;
    if (s == null || s <= 0) break;
    beatStreak++;
  }

  return {
    insiderTransactions,
    netInsiderBuyShares: num(netActivity.buyInfoShares),
    netInsiderSellShares: num(netActivity.sellInfoShares),
    insidersPercentHeld: pct(majorHolders.insidersPercentHeld),
    institutionalHolders,
    institutionsPercentHeld: pct(majorHolders.institutionsPercentHeld),
    institutionsCount: num(majorHolders.institutionsCount),
    netInstitutionalBuyingPercent: pct(netActivity.netInstBuyingPercent),
    sharesShort: num(keyStats.sharesShort),
    sharesShortPriorMonth: num(keyStats.sharesShortPriorMonth),
    shortRatio: num(keyStats.shortRatio),
    shortPercentOfFloat: pct(keyStats.shortPercentOfFloat),
    dateShortInterest: unixToIsoDate(num(keyStats.dateShortInterest)),
    analystActions,
    upgrades90d,
    downgrades90d,
    earningsSurprises,
    beatStreak,
  };
}
