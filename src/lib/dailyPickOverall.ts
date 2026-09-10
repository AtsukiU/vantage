// 各スコアの分母(満点)。dailyScreenStore.ts(スキャン結果の生成側、サーバー専用)と
// ウォッチリストなどのクライアント側の両方から同じ値を参照するため、fsに依存しないこの
// ファイルに置いている。
export const MINERVINI_TOTAL = 8;
export const CANSLIM_TOTAL = 7;
// 財務健全性スコアの既定の満点(非金融セクター向け)。金融セクター(銀行・保険等)は自己資本比率
// 項目を除外するため実際の満点は8になる — その場合は各エントリ自身のqualityTotalフィールド
// (DailyScreenEntry.qualityTotal / StockMetrics.qualityTotal)を優先し、これはデータが
// 無い場合のフォールバックとしてのみ使うこと。
export const QUALITY_TOTAL = 9;
export const FUNDAMENTAL_ROLE_TOTAL = 7;
export const SENTIMENT_ROLE_TOTAL = 5;
export const MACRO_ROLE_TOTAL = 3;

// 総合評価: ミネルヴィニ/CANSLIM/財務健全性/委員会合議の4つを0-1に正規化して単純平均した目安スコア。
// 高度な重み付けはしていない、あくまで「4つの視点をひとまとめに見る」ための参考値。
// 本日の注目銘柄タブ(クライアント)と運用者シミュレーション(サーバー)の両方から同じ計算を
// 使うための共通関数(以前は別々に実装しており、表示が食い違う原因になっていた)。
// DailyScreenEntryだけでなく、StockMetrics由来の必要フィールドだけを持つオブジェクトからも
// 呼べるよう、専用の型に対して定義している(構造的に一致していればどちらも渡せる)。
export interface OverallScoreInput {
  minerviniScore: number | null;
  minerviniTotal: number;
  canslimScore: number | null;
  canslimTotal: number;
  qualityScore: number | null;
  qualityTotal: number;
  committeeAgree: number | null;
  committeeTotal: number | null;
}

export function computeOverallScore(e: OverallScoreInput): { score: number; grade: string } {
  const ratios: number[] = [];
  if (e.minerviniScore != null && e.minerviniTotal > 0) ratios.push(e.minerviniScore / e.minerviniTotal);
  if (e.canslimScore != null && e.canslimTotal > 0) ratios.push(e.canslimScore / e.canslimTotal);
  if (e.qualityScore != null && e.qualityTotal > 0) ratios.push(e.qualityScore / e.qualityTotal);
  if (e.committeeAgree != null && e.committeeTotal) ratios.push(e.committeeAgree / e.committeeTotal);
  if (ratios.length === 0) return { score: 0, grade: "—" };
  const avg = ratios.reduce((s, r) => s + r, 0) / ratios.length;
  const score = Math.round(avg * 100);
  const grade = score >= 85 ? "S" : score >= 70 ? "A" : score >= 55 ? "B" : score >= 40 ? "C" : "D";
  return { score, grade };
}
