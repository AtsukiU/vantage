// stockMetrics.tsから、依存関係を持たない(fs等のサーバー専用モジュールに触れない)純粋な
// ヘルパーだけを切り出したファイル。クライアントコンポーネント(StockDetailView.tsx)から
// 直接importできるようにするためのもの。stockMetrics.ts自体は内部でディスクキャッシュ
// (fundamentalsCache.ts経由でfsを使う)に依存しており、クライアントバンドルに含めると
// ビルドエラーになる(サーバー専用ファイルから直接importしないこと)。

export function isFinancialSector(sector: string | null): boolean {
  return sector === "Financial Services";
}
