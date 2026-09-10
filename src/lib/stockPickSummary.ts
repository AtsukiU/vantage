import type { ScoreResult } from "./checklistTypes";
import type { CommitteeVerdict } from "./committeeScore";

// 銘柄詳細ページの会社名の下に出す「なぜ狙い目か」の短い要約。既に計算済みのスコアから
// 基準を満たしている項目だけを拾って並べる、ルールベースの簡易サマリー(LLM不使用、追加のAPI
// 呼び出しなし)。目立った強気材料が無ければ何も返さない(無理に「狙い目」と言わない)。
export function buildPickSummary(params: {
  minervini: ScoreResult | null;
  canslim: ScoreResult | null;
  qualityScore: ScoreResult | null;
  committee: CommitteeVerdict | null;
  relativeStrengthPct: number | null;
}): string | null {
  const { minervini, canslim, qualityScore, committee, relativeStrengthPct } = params;
  const points: string[] = [];

  if (minervini && minervini.total > 0 && minervini.passCount / minervini.total >= 0.75) {
    points.push(`ミネルヴィニ${minervini.passCount}/${minervini.total}(トレンド良好)`);
  }
  if (canslim && canslim.total > 0 && canslim.passCount / canslim.total >= 0.7) {
    points.push(`CANSLIM${canslim.passCount}/${canslim.total}`);
  }
  if (qualityScore && qualityScore.total > 0 && qualityScore.passCount / qualityScore.total >= 0.75) {
    points.push(`財務健全性${qualityScore.passCount}/${qualityScore.total}`);
  }
  if (committee && committee.total > 0 && committee.agree / committee.total >= 0.6) {
    points.push(`投資委員会${committee.agree}/${committee.total}が賛成`);
  }
  if (relativeStrengthPct != null && relativeStrengthPct >= 10) {
    points.push(`対ベンチマーク相対力+${relativeStrengthPct.toFixed(0)}pt`);
  }

  if (points.length === 0) return null;
  return `注目ポイント: ${points.join("・")}`;
}
