import { parseFeeds, type NewsItem } from "./news";

// 個別銘柄名+ティッカーでGoogle Newsを検索し、直近の関連記事を取得する。
// src/lib/news.ts の市場ニュースと同じRSSパース・重複排除ロジックを再利用する。
export async function fetchStockNews(ticker: string, name: string | null): Promise<NewsItem[]> {
  const isJp = ticker.endsWith(".T");
  const queryTerms = name ? `"${name}" OR ${ticker}` : ticker;

  const url = isJp
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(
        queryTerms
      )}&hl=ja&gl=JP&ceid=JP:ja`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(
        queryTerms
      )}&hl=en-US&gl=US&ceid=US:en`;

  return parseFeeds([{ name: "Google ニュース", url, isGoogleNews: true }]);
}
