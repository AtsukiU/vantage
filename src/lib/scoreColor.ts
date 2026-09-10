import { GLASS_EXCELLENT, GLASS_GOOD, GLASS_TEXT2 } from "./glassStyles";

// スコア表示(X/Y点)・総合評価グレード(S/A/B/C/D)の色分けを全画面で統一するための共通ロジック。
// 以前は画面ごとに微妙に基準が違ったり2段階(合格/その他)しか無かったりしたため、
// 「80%以上=ゴールド(特に良い)/60%以上=ティール(良い)/それ未満=グレー(目立たせない)」の
// 3段階に揃えている。

export function scoreColor(passCount: number | null | undefined, total: number | null | undefined): string {
  if (passCount == null || !total) return GLASS_TEXT2;
  const ratio = passCount / total;
  if (ratio >= 0.8) return GLASS_EXCELLENT;
  if (ratio >= 0.6) return GLASS_GOOD;
  return GLASS_TEXT2;
}

// 総合評価グレード(S/A/B/C/D)用。S=ゴールド、A=ティール、B/C/D=グレーで統一する。
export function gradeColor(grade: string): string {
  if (grade === "S") return GLASS_EXCELLENT;
  if (grade === "A") return GLASS_GOOD;
  return GLASS_TEXT2;
}
