// N案(ガラス×インフォグラフィック型)のモックアップから採った配色。
// 株価の上昇/下落は既存アプリの慣例(赤=上昇・青=下落)のまま、
// 「良い数値」のハイライトはその2色と混同しないよう独立した緑を使う。
export const stockTheme = {
  accent: "var(--accent)",
  up: "var(--price-up)",
  down: "var(--price-down)",
  good: "var(--status-good)",
  border: "var(--border-subtle)",
  text: "var(--foreground)",
  text2: "var(--text-secondary)",
  surfaceBorder: "rgba(255,255,255,.6)",
} as const;
