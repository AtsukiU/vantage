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
  // 前月比・前年比は1年分の日次終値から算出するため、データが足りない銘柄ではnullになりうる
  changePercentMonth: number | null;
  changePercentYear: number | null;
  currency: string;
}

interface YahooChartMeta {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  currency?: string;
}

// 前月比は直近21営業日(≒1ヶ月)前の終値、前年比は取得した1年分の系列の先頭(≒1年前)の
// 終値と比較する。前年比は半年に満たないデータしかない場合は不正確になるため算出しない。
const TRADING_DAYS_PER_MONTH = 21;
const MIN_TRADING_DAYS_FOR_YEAR = TRADING_DAYS_PER_MONTH * 6;

async function fetchQuote(item: QuoteSymbol): Promise<Quote | null> {
  // 現在値・前日比だけなら軽量なmetaのみで足りるが、前月比・前年比も同じ問い合わせ回数のまま
  // 出せるように、日足の1年分の終値もあわせて取得する(個別株チャートのfetchRawPriceSeriesと同じAPI)。
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    item.symbol
  )}?range=1y&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; StockNewsApp/1.0)" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const meta: YahooChartMeta | undefined = result?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") return null;

  const rawCloses: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
  const closes = rawCloses.filter((c): c is number => c != null);

  // 注意: chartPreviousCloseは「range指定なし」なら前営業日終値だが、range=1yを付けると
  // 「取得範囲の開始日の前日」の終値を指すようになる(Yahoo API側の仕様)。そのままだと
  // 前日比のつもりが前年比とほぼ同じ値になってしまうため、regularMarketPreviousClose
  // (previousClose)を優先し、それも無ければ終値系列の末尾から2番目を使う。
  const price = meta.regularMarketPrice;
  const previousClose =
    meta.previousClose ??
    (closes.length >= 2 ? closes[closes.length - 2] : undefined) ??
    meta.chartPreviousClose;
  const change =
    typeof previousClose === "number" ? price - previousClose : 0;
  const changePercent =
    typeof previousClose === "number" && previousClose !== 0
      ? (change / previousClose) * 100
      : 0;

  let changePercentMonth: number | null = null;
  if (closes.length > TRADING_DAYS_PER_MONTH) {
    const monthAgoClose = closes[closes.length - 1 - TRADING_DAYS_PER_MONTH];
    changePercentMonth =
      monthAgoClose !== 0 ? ((price - monthAgoClose) / monthAgoClose) * 100 : null;
  }

  let changePercentYear: number | null = null;
  if (closes.length >= MIN_TRADING_DAYS_FOR_YEAR) {
    const yearAgoClose = closes[0];
    changePercentYear =
      yearAgoClose !== 0 ? ((price - yearAgoClose) / yearAgoClose) * 100 : null;
  }

  return {
    symbol: item.symbol,
    label: item.label,
    price,
    change,
    changePercent,
    changePercentMonth,
    changePercentYear,
    currency: meta.currency ?? "",
  };
}

// ダッシュボード・サイドバー・運用アドバイザータブなど複数箇所がほぼ同時にこの関数を呼ぶため、
// 短時間だけプロセス内にキャッシュして無駄なYahoo Financeへの重複問い合わせを避ける
// (marketBenchmark.tsと同じ考え方)。指数・為替なので数十秒程度の遅延は実用上問題にならない。
const CACHE_TTL_MS = 20 * 1000;
let cache: { data: Quote[]; fetchedAt: number } | null = null;

export async function fetchQuotes(): Promise<Quote[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.data;

  const results = await Promise.allSettled(
    TICKER_SYMBOLS.map((s) => fetchQuote(s))
  );
  const quotes = results
    .filter(
      (r): r is PromiseFulfilledResult<Quote | null> => r.status === "fulfilled"
    )
    .map((r) => r.value)
    .filter((q): q is Quote => q !== null);

  cache = { data: quotes, fetchedAt: Date.now() };
  return quotes;
}
