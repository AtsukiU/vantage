import type { StockMetrics } from "./stockMetrics";
import { buildScoreResult, type ScoreResult } from "./checklistTypes";

// 投資委員会の「ファンダメンタル役」による簡易チェックリスト(7項目)。
// バリュエーション・収益性・成長性・安全域(グレアムナンバー)を機械的に判定する。
// 銀行・保険などの自己資本比率の特殊性はここでは扱わない(PER/PBR/ROE/配当は
// 業種を問わず意味を持つ指標のため、isFinancialSectorによる除外はstockGauges.ts等と違い不要)。

export function computeFundamentalRoleScore(m: StockMetrics): ScoreResult {
  return buildScoreResult([
    {
      key: "per",
      label: "PERが割安水準(15倍以下)",
      pass: m.per != null && m.per > 0 && m.per <= 15,
      detail: m.per != null ? `PER ${m.per.toFixed(1)}倍` : "データ不足",
    },
    {
      key: "pbr",
      label: "PBRが割安水準(1.5倍以下)",
      pass: m.pbr != null && m.pbr > 0 && m.pbr <= 1.5,
      detail: m.pbr != null ? `PBR ${m.pbr.toFixed(2)}倍` : "データ不足",
    },
    {
      key: "roe",
      label: "ROEが10%以上",
      pass: m.roe != null && m.roe >= 10,
      detail: m.roe != null ? `ROE ${m.roe.toFixed(1)}%` : "データ不足",
    },
    {
      key: "revenue_growth",
      label: "増収基調",
      pass: m.revenueGrowth != null && m.revenueGrowth > 0,
      detail: m.revenueGrowth != null ? `売上成長率 ${m.revenueGrowth.toFixed(1)}%` : "データ不足",
    },
    {
      key: "earnings_growth",
      label: "増益基調",
      pass: m.earningsGrowth != null && m.earningsGrowth > 0,
      detail: m.earningsGrowth != null ? `利益成長率 ${m.earningsGrowth.toFixed(1)}%` : "データ不足",
    },
    {
      key: "dividend",
      label: "配当がある",
      pass: m.dividendYield != null && m.dividendYield > 0,
      detail: m.dividendYield != null ? `配当利回り ${m.dividendYield.toFixed(1)}%` : "無配",
    },
    {
      key: "margin_of_safety",
      label: "グレアムナンバー以下(安全域あり)",
      pass: m.grahamNumber != null && m.price != null && m.price <= m.grahamNumber,
      detail:
        m.grahamNumber != null && m.price != null
          ? `現在値/グレアム数 ${(m.price / m.grahamNumber).toFixed(2)}倍`
          : "算出不可(赤字等)",
    },
  ]);
}
