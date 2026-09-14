// N案(ガラス×インフォグラフィック型)で採用した配色・カードスタイルを、
// 銘柄検索・スクリーニング・ポートフォリオの全タブで共通して使う。
export const GLASS_ACCENT = "var(--accent)";
export const GLASS_GOOD = "var(--status-good)";
export const GLASS_EXCELLENT = "var(--accent-strong)"; // スコアが特に高い(80%以上)ことを示すゴールド強調色
export const GLASS_UP = "var(--price-up)"; // 株価上昇(日本の慣例: 赤)
export const GLASS_DOWN = "var(--price-down)"; // 株価下落(日本の慣例: 青)
// 「ヒーロー」強調色(1画面に1つ程度、一番見てほしい数値・CTAだけに使う濃いオレンジ)。
// 株価の上昇=赤/下落=青という既存の色分けと混同しないよう、価格の増減を示す文脈では絶対に使わない。
export const GLASS_HERO = "var(--hero)";
export const GLASS_TEXT = "var(--foreground)";
export const GLASS_TEXT2 = "var(--text-secondary)";
export const GLASS_BORDER = "var(--border-subtle)";

// カードの角丸・背景・ぼかし・影はテーマごとに変わる(globals.cssの--card-*参照)。
// ゴールドテーマは従来通りの半透明グラス、他テーマはそれぞれの参考画像に寄せたフラット/ソリッドな質感になる。
export const GLASS_CARD =
  "rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--card-bg)] backdrop-blur-[var(--card-blur)] p-4 shadow-[var(--card-shadow)]";
export const GLASS_PILL_GROUP = "flex gap-[3px] rounded-full bg-[var(--fill-pill)] p-[3px]";
export const GLASS_BTN_PRIMARY =
  "rounded-full bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-40";
export const GLASS_BTN_GHOST =
  "rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]";
