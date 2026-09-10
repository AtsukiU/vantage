export interface QuoteSymbol {
  symbol: string;
  label: string;
}

export const TICKER_SYMBOLS: QuoteSymbol[] = [
  { symbol: "^N225", label: "日経平均" },
  { symbol: "1306.T", label: "TOPIX" },
  { symbol: "JPY=X", label: "ドル円" },
  { symbol: "^GSPC", label: "S&P500" },
  { symbol: "^DJI", label: "NYダウ" },
  { symbol: "^IXIC", label: "NASDAQ" },
  { symbol: "^VIX", label: "VIX" },
];

export interface Quote {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
}

interface YahooChartMeta {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  currency?: string;
}

async function fetchQuote(item: QuoteSymbol): Promise<Quote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    item.symbol
  )}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; StockNewsApp/1.0)" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;

  const json = await res.json();
  const meta: YahooChartMeta | undefined = json?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") return null;

  const previousClose = meta.chartPreviousClose ?? meta.previousClose;
  const price = meta.regularMarketPrice;
  const change =
    typeof previousClose === "number" ? price - previousClose : 0;
  const changePercent =
    typeof previousClose === "number" && previousClose !== 0
      ? (change / previousClose) * 100
      : 0;

  return {
    symbol: item.symbol,
    label: item.label,
    price,
    change,
    changePercent,
    currency: meta.currency ?? "",
  };
}

export async function fetchQuotes(): Promise<Quote[]> {
  const results = await Promise.allSettled(
    TICKER_SYMBOLS.map((s) => fetchQuote(s))
  );
  return results
    .filter(
      (r): r is PromiseFulfilledResult<Quote | null> => r.status === "fulfilled"
    )
    .map((r) => r.value)
    .filter((q): q is Quote => q !== null);
}
