// Yahoo Financeから取得したセクター名(英語)を表示用に日本語へ変換する。
// 内部の比較ロジック(isFinancialSectorなど)は英語の原文字列のまま扱うため、
// このマップは表示直前にだけ通す。

const SECTOR_LABELS_JA: Record<string, string> = {
  Technology: "テクノロジー",
  "Financial Services": "金融",
  Healthcare: "ヘルスケア",
  "Consumer Cyclical": "一般消費財",
  "Consumer Defensive": "生活必需品",
  Industrials: "資本財",
  "Communication Services": "通信サービス",
  Energy: "エネルギー",
  "Basic Materials": "素材",
  "Real Estate": "不動産",
  Utilities: "公益事業",
};

export function sectorLabelJa(sector: string): string {
  return SECTOR_LABELS_JA[sector] ?? sector;
}

// セクターごとに固定の色を割り当てたい画面(ダッシュボード・ポートフォリオの配分グラフ)向けに、
// 常に同じ並び順を提供する。保有比率の大小(ランキング)で色を割り振ると、比率の順位が
// 入れ替わるたびに同じセクターの色が変わってしまうため、identity(セクター名)にひもづく
// 固定インデックスとして使う。
export const SECTOR_ORDER: string[] = Object.keys(SECTOR_LABELS_JA);
