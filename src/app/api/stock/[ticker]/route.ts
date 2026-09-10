import { NextRequest, NextResponse } from "next/server";
import { fetchStockMetrics } from "@/lib/stockMetrics";
import { fetchPriceHistory, fetchRawPriceSeries, type ChartRange } from "@/lib/stockChart";
import { analyzeStock } from "@/lib/stockInsights";
import { analyzeTechnicals } from "@/lib/stockTechnicals";
import { buildGaugeSpecs } from "@/lib/stockGauges";
import { buildHorizonAnalysis } from "@/lib/stockHorizonAnalysis";
import { fetchFinancialTrend } from "@/lib/stockFinancials";
import { fetchStockSignals, EMPTY_STOCK_SIGNALS } from "@/lib/stockSignals";
import { fetchMarketBenchmark, trailingReturnPctFor } from "@/lib/marketBenchmark";
import { computeMinerviniTemplate } from "@/lib/minerviniTemplate";
import { computeCanslimChecklist } from "@/lib/canslimChecklist";
import { computeQualityScore } from "@/lib/stockQualityScore";
import { fetchPeerComparison } from "@/lib/stockPeers";
import { computeFundamentalRoleScore } from "@/lib/fundamentalRoleScore";
import { computeSentimentRoleScore } from "@/lib/sentimentRoleScore";
import { computeMacroRoleScore } from "@/lib/macroRoleScore";

export const revalidate = 0;

const VALID_RANGES: ChartRange[] = ["1mo", "6mo", "1y", "2y"];

export async function GET(req: NextRequest, ctx: RouteContext<"/api/stock/[ticker]">) {
  const { ticker } = await ctx.params;
  const rangeParam = req.nextUrl.searchParams.get("range");
  const range: ChartRange = VALID_RANGES.includes(rangeParam as ChartRange)
    ? (rangeParam as ChartRange)
    : "1y";

  try {
    const [metrics, priceHistory, rawSeries] = await Promise.all([
      fetchStockMetrics(ticker),
      fetchPriceHistory(ticker, range),
      fetchRawPriceSeries(ticker),
    ]);

    if (metrics.error) {
      return NextResponse.json(
        { error: "銘柄データが見つかりませんでした。ティッカーを確認してください。" },
        { status: 404 }
      );
    }

    const technicals = analyzeTechnicals(rawSeries.dates, rawSeries.closes);

    // 業績推移・インサイダー/機関投資家動向・ミネルヴィニ/CANSLIM系のスコアは株式のみ意味を持つため、
    // EQUITYの時だけ取得・計算する(ETFや先物・為替では省略)。
    const isEquity = metrics.quoteType === "EQUITY";
    const [financialTrend, signals, benchmark, peers] = await Promise.all([
      isEquity ? fetchFinancialTrend(ticker).catch(() => []) : Promise.resolve([]),
      isEquity ? fetchStockSignals(ticker).catch(() => EMPTY_STOCK_SIGNALS) : Promise.resolve(EMPTY_STOCK_SIGNALS),
      isEquity
        ? fetchMarketBenchmark(ticker).catch(() => ({ sixMonthReturnPct: null, trend: "range" as const }))
        : Promise.resolve({ sixMonthReturnPct: null, trend: "range" as const }),
      isEquity ? fetchPeerComparison(ticker).catch(() => []) : Promise.resolve([]),
    ]);

    const stockSixMonthReturn = trailingReturnPctFor(rawSeries.closes);
    const relativeStrengthPct =
      stockSixMonthReturn != null && benchmark.sixMonthReturnPct != null
        ? Math.round((stockSixMonthReturn - benchmark.sixMonthReturnPct) * 10) / 10
        : null;

    const minervini = isEquity ? computeMinerviniTemplate(rawSeries.closes, relativeStrengthPct) : null;
    const canslim = isEquity
      ? computeCanslimChecklist(metrics, financialTrend, technicals.pctFromWeek52High, signals, relativeStrengthPct, benchmark.trend)
      : null;
    const qualityScore = isEquity ? computeQualityScore(metrics, financialTrend, signals) : null;

    // 投資委員会の各役のスコア。テクニカル役はミネルヴィニ、リスク役はグレアムナンバーとの
    // 比較(marginOfSafetyRatio)を流用する。PM役はブラウザの保有ポートフォリオが必要なため
    // ここでは計算せず、クライアント側(CommitteeVerdictCard)で残り5役とあわせて合議する。
    const fundamentalRole = isEquity ? computeFundamentalRoleScore(metrics) : null;
    const sentimentRole = isEquity ? computeSentimentRoleScore(signals, metrics.recommendationKey) : null;
    const macroRole = isEquity ? computeMacroRoleScore(benchmark, relativeStrengthPct) : null;
    const marginOfSafetyRatio =
      metrics.grahamNumber != null && metrics.grahamNumber > 0 && metrics.price != null
        ? metrics.price / metrics.grahamNumber
        : null;

    const insights = analyzeStock(metrics);
    const gauges = buildGaugeSpecs(metrics);
    const horizons = buildHorizonAnalysis(metrics, technicals);

    return NextResponse.json({
      metrics,
      priceHistory,
      insights,
      technicals,
      gauges,
      horizons,
      financialTrend,
      signals,
      minervini,
      canslim,
      qualityScore,
      peers,
      fundamentalRole,
      sentimentRole,
      macroRole,
      marginOfSafetyRatio,
      relativeStrengthPct,
    });
  } catch (error) {
    console.error("Failed to fetch stock detail", error);
    return NextResponse.json({ error: "銘柄データの取得に失敗しました" }, { status: 502 });
  }
}
