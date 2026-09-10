import { fetchRawPriceSeries, movingAverage } from "./stockChart";

// ミネルヴィニのトレンドテンプレート(相対的な強さ)やCANSLIMのL(先導株か)・M(市場全体の地合い)を
// 判定するために、個別銘柄の値動きを市場平均(ベンチマーク指数)と比較する。
// 日本株はTOPIX連動ETF(1306.T)、それ以外はS&P500(^GSPC)を基準にする簡易的な二択。
// 以前は指数そのもの("998405.T")を指定していたが、これはYahoo Finance上に存在しない
// 無効なティッカーで、日本株の相対力(RS)が常にnullになる原因になっていた
// (1306.Tは実際に取引されるETFで、価格データが確実に取得できる)。

export interface MarketBenchmark {
  sixMonthReturnPct: number | null;
  trend: "uptrend" | "downtrend" | "range";
}

function benchmarkTickerFor(ticker: string): string {
  return ticker.endsWith(".T") ? "1306.T" : "^GSPC";
}

// スクリーニングでウォッチリスト全銘柄を評価する際、同じ指数(TOPIX/S&P500)への
// 問い合わせが銘柄数だけ重複しないよう、短時間だけプロセス内にキャッシュする。
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: MarketBenchmark; fetchedAt: number }>();

function trailingReturnPct(closes: number[], tradingDays: number): number | null {
  if (closes.length < tradingDays + 1) return null;
  const start = closes[closes.length - 1 - tradingDays];
  const end = closes[closes.length - 1];
  if (!start) return null;
  return Math.round(((end - start) / start) * 1000) / 10;
}

function classifyTrend(price: number, ma50: number | null, ma200: number | null): "uptrend" | "downtrend" | "range" {
  if (ma50 == null || ma200 == null) return "range";
  if (price > ma50 && ma50 > ma200) return "uptrend";
  if (price < ma50 && ma50 < ma200) return "downtrend";
  return "range";
}

export async function fetchMarketBenchmark(ticker: string): Promise<MarketBenchmark> {
  const key = benchmarkTickerFor(ticker);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

  const { closes } = await fetchRawPriceSeries(key);
  if (closes.length === 0) return { sixMonthReturnPct: null, trend: "range" };

  const ma50 = movingAverage(closes, 50);
  const ma200 = movingAverage(closes, 200);
  const price = closes[closes.length - 1];

  const data: MarketBenchmark = {
    sixMonthReturnPct: trailingReturnPct(closes, 126),
    trend: classifyTrend(price, ma50[ma50.length - 1], ma200[ma200.length - 1]),
  };
  cache.set(key, { data, fetchedAt: Date.now() });
  return data;
}

export function trailingReturnPctFor(closes: number[], tradingDays = 126): number | null {
  return trailingReturnPct(closes, tradingDays);
}
