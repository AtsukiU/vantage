// 財務健全性スコア・ミネルヴィニのトレンドテンプレート・CANSLIMチェックリストなど、
// 「複数の合否条件を数えて◯/◯点で見せる」系のスコアで共通して使う型。

export interface ScoreCriterion {
  key: string;
  label: string;
  pass: boolean;
  detail: string;
}

export interface ScoreResult {
  criteria: ScoreCriterion[];
  passCount: number;
  total: number;
}

export function buildScoreResult(criteria: ScoreCriterion[]): ScoreResult {
  return {
    criteria,
    passCount: criteria.filter((c) => c.pass).length,
    total: criteria.length,
  };
}
