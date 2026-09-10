import { fetchStockMetrics, type StockMetrics } from "./stockMetrics";
import { fetchRawPriceSeries } from "./stockChart";
import { analyzeTechnicals } from "./stockTechnicals";
import { fetchFinancialTrend } from "./stockFinancials";
import { fetchStockSignals, EMPTY_STOCK_SIGNALS } from "./stockSignals";
import { fetchMarketBenchmark, trailingReturnPctFor } from "./marketBenchmark";
import { computeMinerviniTemplate } from "./minerviniTemplate";
import { computeCanslimChecklist } from "./canslimChecklist";
import { computeQualityScore } from "./stockQualityScore";
import { computeFundamentalRoleScore } from "./fundamentalRoleScore";
import { computeSentimentRoleScore } from "./sentimentRoleScore";
import { computeMacroRoleScore } from "./macroRoleScore";
import { computeCommitteeVerdict, type CommitteeVerdict } from "./committeeScore";

// 1銘柄分の「スコア一式」(ミネルヴィニ/CANSLIM/財務健全性/投資委員会各役)をまとめて計算する。
// スクリーニングの?scores=1エンドポイントと、本日の注目銘柄(全銘柄バッチスキャン)の
// 両方から同じロジックを使うための共通関数(PM役はブラウザの保有銘柄が必要なため含まない、
// 5役の合議までがサーバー側で計算できる範囲)。

export interface StockScoreBundle {
  metrics: StockMetrics;
  minerviniScore: number | null;
  canslimScore: number | null;
  qualityScore: number | null;
  // 金融セクターは自己資本比率の項目を除外するため8点満点、それ以外は9点満点(可変)。
  qualityTotal: number | null;
  fundamentalRoleScore: number | null;
  sentimentRoleScore: number | null;
  macroRoleScore: number | null;
  committeeAgree: number | null;
  committeeTotal: number | null;
  // 各役が賛成/反対だったかの内訳(ホバー時の理由表示に使う)。pmはサーバー側では計算できないため常にnull。
  committeeRoles: CommitteeVerdict["roles"] | null;
  // 対ベンチマーク6ヶ月相対力(パーセンテージポイント差)。本日の注目銘柄では、この値を
  // スキャン対象全体の中でパーセンタイル順位に変換して「相対力(RS)上位◯%」フィルタに使う。
  relativeStrengthPct: number | null;
}

export async function computeStockScores(ticker: string): Promise<StockScoreBundle> {
  const metrics = await fetchStockMetrics(ticker);

  const empty: StockScoreBundle = {
    metrics,
    minerviniScore: null,
    canslimScore: null,
    qualityScore: null,
    qualityTotal: null,
    fundamentalRoleScore: null,
    sentimentRoleScore: null,
    macroRoleScore: null,
    committeeAgree: null,
    committeeTotal: null,
    committeeRoles: null,
    relativeStrengthPct: null,
  };

  if (metrics.error || metrics.quoteType !== "EQUITY") return empty;

  const [rawSeries, financialTrend, signals, benchmark] = await Promise.all([
    fetchRawPriceSeries(ticker),
    fetchFinancialTrend(ticker).catch(() => []),
    fetchStockSignals(ticker).catch(() => EMPTY_STOCK_SIGNALS),
    fetchMarketBenchmark(ticker).catch(() => ({ sixMonthReturnPct: null, trend: "range" as const })),
  ]);

  const stockSixMonthReturn = trailingReturnPctFor(rawSeries.closes);
  const relativeStrengthPct =
    stockSixMonthReturn != null && benchmark.sixMonthReturnPct != null
      ? Math.round((stockSixMonthReturn - benchmark.sixMonthReturnPct) * 10) / 10
      : null;
  const technicals = analyzeTechnicals(rawSeries.dates, rawSeries.closes);

  const minerviniResult = computeMinerviniTemplate(rawSeries.closes, relativeStrengthPct);
  const fundamentalResult = computeFundamentalRoleScore(metrics);
  const sentimentResult = computeSentimentRoleScore(signals, metrics.recommendationKey);
  const macroResult = computeMacroRoleScore(benchmark, relativeStrengthPct);
  const marginOfSafetyRatio =
    metrics.grahamNumber != null && metrics.grahamNumber > 0 && metrics.price != null
      ? metrics.price / metrics.grahamNumber
      : null;
  const verdict = computeCommitteeVerdict(fundamentalResult, minerviniResult, sentimentResult, marginOfSafetyRatio, macroResult);

  const canslimScore = computeCanslimChecklist(
    metrics,
    financialTrend,
    technicals.pctFromWeek52High,
    signals,
    relativeStrengthPct,
    benchmark.trend
  ).passCount;
  const qualityResult = computeQualityScore(metrics, financialTrend, signals);

  return {
    metrics,
    minerviniScore: minerviniResult.passCount,
    canslimScore,
    qualityScore: qualityResult.passCount,
    qualityTotal: qualityResult.total,
    fundamentalRoleScore: fundamentalResult.passCount,
    sentimentRoleScore: sentimentResult.passCount,
    macroRoleScore: macroResult.passCount,
    committeeAgree: verdict.agree,
    committeeTotal: verdict.total,
    committeeRoles: verdict.roles,
    relativeStrengthPct,
  };
}
