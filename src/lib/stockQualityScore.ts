import { isFinancialSector, type StockMetrics } from "./stockMetrics";
import type { FinancialYear } from "./stockFinancials";
import type { StockSignals } from "./stockSignals";
import { buildScoreResult, type ScoreCriterion, type ScoreResult } from "./checklistTypes";

// ピオトロスキーのFスコア(9項目の財務健全性チェック)に着想を得た簡易スコア。
// 本家は貸借対照表・キャッシュフローの詳細(総資産回転率や株式希薄化など)まで見るが、
// このアプリで取得できる指標の範囲で近い考え方を再現した簡易版(名称は「財務健全性スコア」とし、
// 正式なFスコアとは区別している)。

export function computeQualityScore(
  metrics: StockMetrics,
  financialTrend: FinancialYear[],
  signals: StockSignals
): ScoreResult {
  const recent = financialTrend.slice(-3);
  const revenues = recent.map((y) => y.revenue).filter((v): v is number => v != null);
  const operatingIncomes = recent.map((y) => y.operatingIncome).filter((v): v is number => v != null);

  const revenueGrowingYoy = revenues.length >= 2 && revenues[revenues.length - 1] > revenues[revenues.length - 2];
  const operatingIncomeGrowingYoy =
    operatingIncomes.length >= 2 && operatingIncomes[operatingIncomes.length - 1] > operatingIncomes[operatingIncomes.length - 2];

  const latestSurprise = signals.earningsSurprises[signals.earningsSurprises.length - 1] ?? null;
  const beatLatestEstimate = latestSurprise?.surprisePercent != null && latestSurprise.surprisePercent > 0;

  // 銀行・保険などの金融セクターは業態上、自己資本比率が構造的に低いのが普通のため
  // (isFinancialSectorのコメント参照)、この基準は判定対象から除外する(満点の分母も減る)。
  const isFinancial = isFinancialSector(metrics.sector);

  const criteria: ScoreCriterion[] = [
    {
      key: "positive_roe",
      label: "ROEがプラス",
      pass: metrics.roe != null && metrics.roe > 0,
      detail: metrics.roe != null ? `ROE ${metrics.roe.toFixed(1)}%` : "データ不足",
    },
    {
      key: "positive_operating_margin",
      label: "営業利益率がプラス(本業が黒字)",
      pass: metrics.operatingMargin != null && metrics.operatingMargin > 0,
      detail: metrics.operatingMargin != null ? `営業利益率 ${metrics.operatingMargin.toFixed(1)}%` : "データ不足",
    },
    {
      key: "earnings_growth",
      label: "利益成長率がプラス",
      pass: metrics.earningsGrowth != null && metrics.earningsGrowth > 0,
      detail: metrics.earningsGrowth != null ? `利益成長率 ${metrics.earningsGrowth.toFixed(1)}%` : "データ不足",
    },
    {
      key: "revenue_growing",
      label: "売上高が前期比で増加",
      pass: revenueGrowingYoy,
      detail: revenues.length >= 2 ? `${revenues[revenues.length - 2].toLocaleString()} → ${revenues[revenues.length - 1].toLocaleString()}` : "データ不足",
    },
  ];

  if (!isFinancial) {
    criteria.push({
      key: "equity_ratio",
      label: "自己資本比率が40%以上",
      pass: metrics.equityRatio != null && metrics.equityRatio >= 40,
      detail: metrics.equityRatio != null ? `自己資本比率 ${metrics.equityRatio.toFixed(0)}%` : "データ不足",
    });
  }

  criteria.push(
    {
      key: "current_ratio",
      label: "流動比率が1.0倍以上",
      pass: metrics.currentRatio != null && metrics.currentRatio >= 1.0,
      detail: metrics.currentRatio != null ? `流動比率 ${metrics.currentRatio.toFixed(1)}倍` : "データ不足",
    },
    {
      key: "debt_to_equity",
      label: "負債比率が過度に高くない(100%未満)",
      pass: metrics.debtToEquity != null && metrics.debtToEquity < 100,
      detail: metrics.debtToEquity != null ? `負債比率 ${metrics.debtToEquity.toFixed(0)}%` : "データ不足",
    },
    {
      key: "operating_income_growing",
      label: "営業利益が前期比で増加(効率性の改善)",
      pass: operatingIncomeGrowingYoy,
      detail:
        operatingIncomes.length >= 2
          ? `${operatingIncomes[operatingIncomes.length - 2].toLocaleString()} → ${operatingIncomes[operatingIncomes.length - 1].toLocaleString()}`
          : "データ不足",
    },
    {
      key: "earnings_quality",
      label: "直近決算が市場予想を上回った",
      pass: beatLatestEstimate,
      detail: latestSurprise?.surprisePercent != null ? `サプライズ ${latestSurprise.surprisePercent >= 0 ? "+" : ""}${latestSurprise.surprisePercent.toFixed(1)}%` : "データ不足",
    }
  );

  return buildScoreResult(criteria);
}
