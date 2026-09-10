// N案(ガラス×インフォグラフィック型)で採用した配色・カードスタイルを、
// 銘柄検索・スクリーニング・ポートフォリオ・シミュレーターの全タブで共通して使う。
export const GLASS_ACCENT = "#c9962f";
export const GLASS_GOOD = "#2f9e5c";
export const GLASS_EXCELLENT = "#cf9a4c"; // スコアが特に高い(80%以上)ことを示すゴールド強調色
export const GLASS_UP = "#c0392b"; // 株価上昇(日本の慣例: 赤)
export const GLASS_DOWN = "#2f6fb0"; // 株価下落(日本の慣例: 青)
// 「ヒーロー」強調色(1画面に1つ程度、一番見てほしい数値・CTAだけに使う濃いオレンジ)。
// 株価の上昇=赤/下落=青という既存の色分けと混同しないよう、価格の増減を示す文脈では絶対に使わない。
export const GLASS_HERO = "#d9662c";
export const GLASS_TEXT = "#1c1b18";
export const GLASS_TEXT2 = "#6c6656";
export const GLASS_BORDER = "#e2dfd2";

export const GLASS_CARD =
  "rounded-[18px] border border-white/45 bg-white/48 backdrop-blur-lg p-4 shadow-[0_1px_2px_rgba(28,27,24,0.04),0_10px_24px_-8px_rgba(28,27,24,0.10)]";
export const GLASS_PILL_GROUP = "flex gap-[3px] rounded-full bg-[#f0efe6] p-[3px]";
export const GLASS_BTN_PRIMARY =
  "rounded-full bg-[#c9962f] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#ab7d24] disabled:opacity-40";
export const GLASS_BTN_GHOST =
  "rounded-full border border-[#e2dfd2] px-3 py-1.5 text-xs text-[#6c6656] transition hover:border-[#c9962f] hover:text-[#c9962f]";
