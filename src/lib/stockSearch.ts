import { resolveJpAlias } from "./jpTickerAliases";
import { searchJpListedDirectory } from "./jpListedDirectory";

export interface StockSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  quoteType: string;
}

const SEARCHABLE_TYPES = new Set([
  "EQUITY",
  "ETF",
  "FUTURE",
  "CURRENCY",
  "CRYPTOCURRENCY",
  "INDEX",
]);

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; StockNewsApp/1.0)" };

interface YahooSearchQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  quoteType?: string;
}

async function fetchYahooSearch(query: string): Promise<StockSearchResult[]> {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    query
  )}&quotesCount=8&newsCount=0&lang=ja-JP`;
  const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];

  const json = await res.json();
  const quotes: YahooSearchQuote[] = json?.quotes ?? [];

  return quotes
    .filter((q) => q.symbol && q.quoteType && SEARCHABLE_TYPES.has(q.quoteType))
    .map((q) => ({
      symbol: q.symbol as string,
      name: q.shortname ?? q.longname ?? (q.symbol as string),
      exchange: q.exchange ?? "",
      quoteType: q.quoteType as string,
    }));
}

async function fetchAliasAsResult(ticker: string): Promise<StockSearchResult | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`;
  const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta?.symbol) return null;
  return {
    symbol: meta.symbol,
    name: meta.shortName ?? meta.symbol,
    exchange: meta.exchangeName ?? "",
    quoteType: meta.instrumentType ?? "EQUITY",
  };
}

// 検索は3段構え:
// ①通称・略称の手動マッピング(jpTickerAliases.ts、例: "ユニクロ"→ファーストリテイリング)
// ②JPX上場銘柄一覧のローカル検索(jpListedDirectory.ts、東証上場約4,400銘柄を前方/部分一致)
// ③Yahoo Financeの検索API(米国株・海外ETF・コモディティ・為替など①②でカバーしない範囲)
// Yahoo側は日本語のカタカナ・中小型株名の検索精度が低いため、②で東証銘柄はほぼ全てカバーする。
export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const aliasTicker = resolveJpAlias(trimmed);
  const jpDirectoryResults = searchJpListedDirectory(trimmed, 8);

  const [aliasResult, searchResults] = await Promise.all([
    aliasTicker ? fetchAliasAsResult(aliasTicker) : Promise.resolve(null),
    fetchYahooSearch(trimmed),
  ]);

  const results: StockSearchResult[] = [];
  const seen = new Set<string>();

  if (aliasResult) {
    results.push(aliasResult);
    seen.add(aliasResult.symbol);
  }
  for (const r of jpDirectoryResults) {
    if (seen.has(r.symbol)) continue;
    results.push(r);
    seen.add(r.symbol);
  }
  for (const r of searchResults) {
    if (seen.has(r.symbol)) continue;
    results.push(r);
    seen.add(r.symbol);
  }

  return results.slice(0, 8);
}
