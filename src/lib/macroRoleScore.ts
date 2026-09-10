import type { MarketBenchmark } from "./marketBenchmark";
import { buildScoreResult, type ScoreResult } from "./checklistTypes";

// 投資委員会の「マクロ/ストラテジスト役」による簡易チェックリスト(3項目)。
// 個別銘柄そのものではなく「市場全体の地合いはこの銘柄にとって追い風か」を判定する。
// ベンチマーク指数(日本株ならTOPIX、それ以外はS&P500)のトレンドと、個別銘柄の
// 相対力(ミネルヴィニ/CANSLIM判定と同じ算出方法)を流用しているため、追加のデータ取得は不要。

export function computeMacroRoleScore(benchmark: MarketBenchmark, relativeStrengthPct: number | null): ScoreResult {
  return buildScoreResult([
    {
      key: "benchmark_uptrend",
      label: "市場全体(ベンチマーク指数)が上昇トレンド",
      pass: benchmark.trend === "uptrend",
      detail: `ベンチマーク: ${benchmark.trend === "uptrend" ? "上昇トレンド" : benchmark.trend === "downtrend" ? "下降トレンド" : "方向感なし"}`,
    },
    {
      key: "benchmark_return",
      label: "ベンチマークの6ヶ月騰落率がプラス",
      pass: benchmark.sixMonthReturnPct != null && benchmark.sixMonthReturnPct > 0,
      detail: benchmark.sixMonthReturnPct != null ? `6ヶ月騰落率 ${benchmark.sixMonthReturnPct >= 0 ? "+" : ""}${benchmark.sixMonthReturnPct.toFixed(1)}%` : "データ不足",
    },
    {
      key: "relative_strength",
      label: "個別銘柄が市場平均より相対的に強い",
      pass: relativeStrengthPct != null && relativeStrengthPct > 0,
      detail: relativeStrengthPct != null ? `対ベンチマーク6ヶ月騰落率差 ${relativeStrengthPct >= 0 ? "+" : ""}${relativeStrengthPct.toFixed(1)}pt` : "データ不足",
    },
  ]);
}
