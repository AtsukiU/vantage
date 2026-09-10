import type { StockMetrics } from "./stockMetrics";
import type { FinancialYear } from "./stockFinancials";
import type { StockSignals } from "./stockSignals";
import { buildScoreResult, type ScoreResult } from "./checklistTypes";

// ウィリアム・オニールのCANSLIMをTypeScriptで簡易再現したチェックリスト。
// C=当期の利益成長、A=年間の利益成長、N=新高値・新展開、S=需給(出来高)、L=主導株か(相対力)、
// I=機関投資家の買い、M=市場全体の地合い。本来のCANSLIMは四半期EPSの前年比や業界内順位など
// より厳密な定義だが、このアプリで取得できるデータの範囲で近似している。

export function computeCanslimChecklist(
  metrics: StockMetrics,
  financialTrend: FinancialYear[],
  pctFromWeek52High: number | null,
  signals: StockSignals,
  relativeStrengthPct: number | null,
  benchmarkTrend: "uptrend" | "downtrend" | "range"
): ScoreResult {
  const currentEarningsGrowth = metrics.earningsGrowth;
  const currentGrowthPass = currentEarningsGrowth != null && currentEarningsGrowth >= 25;

  const recentYears = financialTrend.slice(-3);
  const netIncomes = recentYears.map((y) => y.netIncome).filter((v): v is number => v != null);
  let annualGrowthPass = false;
  let annualGrowthDetail = "データ不足";
  if (netIncomes.length >= 2) {
    let consecutiveGrowth = 0;
    for (let i = netIncomes.length - 1; i > 0; i--) {
      if (netIncomes[i] > netIncomes[i - 1]) consecutiveGrowth++;
      else break;
    }
    annualGrowthPass = consecutiveGrowth >= 2;
    annualGrowthDetail = `直近${netIncomes.length}期中、${consecutiveGrowth}期連続で純利益が増加`;
  }

  const nearNewHigh = pctFromWeek52High != null && pctFromWeek52High >= -15;

  const volumeRatio = metrics.volumeRatio;
  const supplyDemandPass = volumeRatio != null && volumeRatio >= 1.5;

  const leaderPass = relativeStrengthPct != null && relativeStrengthPct > 5;

  const institutionalBuying =
    (signals.netInstitutionalBuyingPercent != null && signals.netInstitutionalBuyingPercent > 0) ||
    (signals.institutionsPercentHeld != null && signals.institutionsPercentHeld >= 30);

  const marketUptrend = benchmarkTrend === "uptrend";

  return buildScoreResult([
    {
      key: "current_earnings",
      label: "C: 直近の利益成長率が高い(目安25%以上)",
      pass: currentGrowthPass,
      detail: currentEarningsGrowth != null ? `利益成長率 ${currentEarningsGrowth.toFixed(1)}%` : "データ不足",
    },
    {
      key: "annual_earnings",
      label: "A: 年間の利益成長が続いている",
      pass: annualGrowthPass,
      detail: annualGrowthDetail,
    },
    {
      key: "new_high",
      label: "N: 52週高値近辺(新展開)",
      pass: nearNewHigh,
      detail: pctFromWeek52High != null ? `高値比 ${pctFromWeek52High.toFixed(1)}%` : "データ不足",
    },
    {
      key: "supply_demand",
      label: "S: 出来高が急増(需給の逼迫)",
      pass: supplyDemandPass,
      detail: volumeRatio != null ? `出来高倍率 ${volumeRatio.toFixed(2)}倍` : "データ不足",
    },
    {
      key: "leader",
      label: "L: 主導株(市場平均を上回る強さ)",
      pass: leaderPass,
      detail:
        relativeStrengthPct != null
          ? `対ベンチマーク6ヶ月騰落率差 ${relativeStrengthPct >= 0 ? "+" : ""}${relativeStrengthPct.toFixed(1)}pt`
          : "データ不足",
    },
    {
      key: "institutional",
      label: "I: 機関投資家が買っている",
      pass: institutionalBuying,
      detail:
        signals.institutionsPercentHeld != null
          ? `機関投資家保有 ${signals.institutionsPercentHeld.toFixed(1)}%(6ヶ月純増減 ${
              signals.netInstitutionalBuyingPercent != null ? signals.netInstitutionalBuyingPercent.toFixed(1) : "—"
            }%)`
          : "データ不足",
    },
    {
      key: "market",
      label: "M: 市場全体が上昇トレンド",
      pass: marketUptrend,
      detail: `ベンチマーク指数: ${benchmarkTrend === "uptrend" ? "上昇トレンド" : benchmarkTrend === "downtrend" ? "下降トレンド" : "方向感なし"}`,
    },
  ]);
}
