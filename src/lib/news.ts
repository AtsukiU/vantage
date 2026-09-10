import Parser from "rss-parser";
import { FEEDS, type Market } from "./feeds";

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string | null; // RSSのcontentSnippet(HTMLタグ除去済み)を短く切ったもの
}

export interface NewsSource {
  name: string;
  url: string;
  isGoogleNews?: boolean;
}

const parser = new Parser({
  timeout: 10000,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; StockNewsApp/1.0)" },
});

// Google News titles are formatted "Headline - Publisher"; split them apart
// so the feed shows the original publisher instead of just "Google ニュース".
function splitGoogleNewsTitle(rawTitle: string, fallbackSource: string) {
  const idx = rawTitle.lastIndexOf(" - ");
  if (idx <= 0) return { title: rawTitle, source: fallbackSource };
  return { title: rawTitle.slice(0, idx), source: rawTitle.slice(idx + 3) };
}

const MAX_DESCRIPTION_LENGTH = 140;

// RSSのcontentSnippet(rss-parserがHTMLタグを除去済み)を短い概要文に整形する。
// Google Newsフィードのdescriptionは関連記事リンクの羅列になっていることが多く、
// 概要として意味を持たないため除外する。
function extractDescription(snippet: string | undefined, title: string, isGoogleNews: boolean | undefined): string | null {
  if (isGoogleNews || !snippet) return null;
  const cleaned = snippet.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned === title) return null;
  if (cleaned.length <= MAX_DESCRIPTION_LENGTH) return cleaned;
  return `${cleaned.slice(0, MAX_DESCRIPTION_LENGTH)}…`;
}

// RSSフィード一覧を取得・パース・重複排除・新しい順ソートする共通処理。
// 市場ニュース(fetchMarketNews)と個別銘柄ニュース(stockNews.ts)の両方から使う。
export async function parseFeeds(sources: NewsSource[]): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    sources.map((s) => parser.parseURL(s.url))
  );

  const items: NewsItem[] = [];

  results.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const source = sources[i];

    for (const entry of result.value.items) {
      const rawTitle = entry.title?.trim();
      const link = entry.link?.trim();
      const pubDate = entry.isoDate || entry.pubDate;
      if (!rawTitle || !link || !pubDate) continue;

      const parsedDate = new Date(pubDate);
      if (Number.isNaN(parsedDate.getTime())) continue;

      let title = rawTitle;
      let sourceName = source.name;
      if (source.isGoogleNews) {
        const split = splitGoogleNewsTitle(rawTitle, source.name);
        title = split.title;
        sourceName = split.source;
      }

      items.push({
        title,
        link,
        source: sourceName,
        pubDate: parsedDate.toISOString(),
        description: extractDescription(entry.contentSnippet, rawTitle, source.isGoogleNews),
      });
    }
  });

  const seen = new Set<string>();
  const deduped = items.filter((item) => {
    const key = item.title.trim().toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );

  return deduped;
}

export async function fetchMarketNews(market: Market): Promise<NewsItem[]> {
  const sources = FEEDS.filter((f) => f.market === market);
  return parseFeeds(sources);
}

export function withinHours(items: NewsItem[], hours: number): NewsItem[] {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return items.filter((item) => new Date(item.pubDate).getTime() >= cutoff);
}
