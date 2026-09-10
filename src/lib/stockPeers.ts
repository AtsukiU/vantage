// 同業他社・類似銘柄との比較用に、Yahoo Financeの「関連銘柄」を取得する。
// これは正式な業種分類による厳密な同業他社リストではなく、Yahoo自身の類似度アルゴリズムに
// よる「よく一緒に見られる銘柄」であることに注意(recommendationsbysymbolはv8/v1系と同じく
// クッキー+crumb不要の非公式エンドポイント)。

import { fetchStockMetrics } from "./stockMetrics";

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; StockNewsApp/1.0)" };

export interface PeerComparison {
  ticker: string;
  name: string | null;
  price: number | null;
  currency: string | null;
  dayChangePercent: number | null;
  per: number | null;
  pbr: number | null;
  roe: number | null;
  dividendYield: number | null;
  marketCap: number | null;
}

export async function fetchPeerTickers(ticker: string, limit = 5): Promise<string[]> {
  const url = `https://query1.finance.yahoo.com/v6/finance/recommendationsbysymbol/${encodeURIComponent(ticker)}`;
  const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];

  const json = await res.json();
  const symbols = (json?.finance?.result?.[0]?.recommendedSymbols ?? []) as { symbol?: string }[];
  return symbols
    .map((s) => s.symbol)
    .filter((s): s is string => Boolean(s))
    .slice(0, limit);
}

export async function fetchPeerComparison(ticker: string, limit = 5): Promise<PeerComparison[]> {
  const peerTickers = await fetchPeerTickers(ticker, limit);
  if (peerTickers.length === 0) return [];

  const results = await Promise.all(peerTickers.map((t) => fetchStockMetrics(t).catch(() => null)));

  return results
    .filter((m): m is NonNullable<typeof m> => m != null && !m.error)
    .map((m) => ({
      ticker: m.ticker,
      name: m.name,
      price: m.price,
      currency: m.currency,
      dayChangePercent: m.dayChangePercent,
      per: m.per,
      pbr: m.pbr,
      roe: m.roe,
      dividendYield: m.dividendYield,
      marketCap: m.marketCap,
    }));
}
