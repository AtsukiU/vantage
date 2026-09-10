// N案(ガラス×インフォグラフィック型)のモックアップから採った配色。
// 株価の上昇/下落は既存アプリの慣例(赤=上昇・青=下落)のまま、
// 「良い数値」のハイライトはその2色と混同しないよう独立した緑を使う。
export const stockTheme = {
  accent: "#c9962f",
  up: "#c0392b",
  down: "#2f6fb0",
  good: "#2f9e5c",
  border: "#e2dfd2",
  text: "#1c1b18",
  text2: "#6c6656",
  surfaceBorder: "rgba(255,255,255,.6)",
} as const;
