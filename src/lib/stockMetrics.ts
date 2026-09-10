import { getYahooAuth } from "./yahooAuth";
import type { CommitteeVerdict } from "./committeeScore";

export interface StockMetrics {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  currency: string | null;
  price: number | null;
  dayChangePercent: number | null;
  marketCap: number | null;
  per: number | null;
  pbr: number | null;
  roe: number | null; // %
  equityRatio: number | null; // %
  operatingMargin: number | null; // %
  dividendYield: number | null; // %
  payoutRatio: number | null; // %
  dividendGrowthYears: number | null;
  debtToEquity: number | null; // %
  currentRatio: number | null;
  revenueGrowth: number | null; // %
  earningsGrowth: number | null; // %
  beta: number | null;
  priceVs50ma: number | null; // %
  priceVs200ma: number | null; // %
  volumeRatio: number | null;
  targetMeanPrice: number | null; // アナリスト目標株価(平均)
  targetHighPrice: number | null; // アナリスト目標株価(最高)
  targetLowPrice: number | null; // アナリスト目標株価(最低)
  targetMedianPrice: number | null; // アナリスト目標株価(中央値)
  numberOfAnalystOpinions: number | null; // 目標株価を出しているアナリストの人数
  recommendationKey: string | null; // strong_buy/buy/hold/sell/strong_sell など
  earningsDate: string | null; // 次回決算発表予定日(ISO date, 予想のため前後する)
  exDividendDate: string | null; // 直近の配当権利落ち日(ISO date)
  trailingEps: number | null; // 1株当たり利益(実績)
  bookValuePerShare: number | null; // 1株当たり純資産(BPS)
  grahamNumber: number | null; // グレアムナンバー(√(22.5×EPS×BPS)) — 赤字/債務超過では算出不可(null)
  longBusinessSummary: string | null; // 事業内容の説明(Yahoo FinanceのassetProfileから、原文のまま)
  // EQUITY/ETF以外(FUTURE=コモディティ先物, CURRENCY=為替 など)は財務指標が
  // そもそも存在しないため、UI側はこれを見てファンダメンタル分析セクションを省略する。
  quoteType: string | null;
  error?: string;
  // /api/stock/[ticker]/metrics?scores=1 の時だけ埋め込まれるスコア(ウォッチリストなどで使う)。
  // それ以外の取得経路ではundefined。
  minerviniScore?: number | null;
  canslimScore?: number | null;
  qualityScore?: number | null;
  // 金融セクター(銀行・保険等)は自己資本比率の項目を判定対象から除外するため、満点が8点になる
  // (それ以外は9点)。表示側は固定の9点ではなくこの値を分母として使うこと。
  qualityTotal?: number | null;
  committeeScore?: number | null;
  committeeTotal?: number | null;
  // 各役の賛成/反対内訳(ホバー時の理由表示用)。
  committeeRoles?: CommitteeVerdict["roles"] | null;
}

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; StockNewsApp/1.0)" };
// PC/回線がスリープ復帰・Wi-Fi切断等を挟むと、タイムアウト無指定のfetchが永久にpendingのまま
// 返ってこないことがある(1550銘柄フルスキャンの途中でこれが起きると、その時点でスキャン全体が
// 恒久的に止まってしまう)。1銘柄の失敗はrunScan側で握りつぶして次に進む設計なので、ここでは
// 「固まるより早く諦めて次へ」を優先し、全fetchにタイムアウトを付ける。
const FETCH_TIMEOUT_MS = 15000;

export type RawNum = { raw?: number } | number | null | undefined;

export function num(v: RawNum): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  return typeof v.raw === "number" ? v.raw : null;
}

// ratio (0.124) -> percent (12.4), rounded to 1 decimal
function pct(v: RawNum): number | null {
  const n = num(v);
  return n == null ? null : Math.round(n * 1000) / 10;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

interface QuoteSummaryResult {
  price?: {
    regularMarketPrice?: RawNum;
    regularMarketChangePercent?: RawNum;
    regularMarketVolume?: RawNum;
    marketCap?: RawNum;
    shortName?: string;
    longName?: string;
    currency?: string;
    quoteType?: string;
  };
  summaryDetail?: {
    trailingPE?: RawNum;
    dividendYield?: RawNum;
    payoutRatio?: RawNum;
    fiftyDayAverage?: RawNum;
    twoHundredDayAverage?: RawNum;
    averageVolume10days?: RawNum;
    averageVolume?: RawNum;
  };
  defaultKeyStatistics?: {
    priceToBook?: RawNum;
    beta?: RawNum;
    trailingEps?: RawNum;
    bookValue?: RawNum;
  };
  financialData?: {
    returnOnEquity?: RawNum;
    operatingMargins?: RawNum;
    revenueGrowth?: RawNum;
    earningsGrowth?: RawNum;
    debtToEquity?: RawNum;
    currentRatio?: RawNum;
    targetMeanPrice?: RawNum;
    targetHighPrice?: RawNum;
    targetLowPrice?: RawNum;
    targetMedianPrice?: RawNum;
    numberOfAnalystOpinions?: RawNum;
    recommendationKey?: string;
  };
  assetProfile?: {
    sector?: string;
    industry?: string;
    longBusinessSummary?: string;
  };
  calendarEvents?: {
    earnings?: { earningsDate?: RawNum[] };
    exDividendDate?: RawNum;
  };
}

interface TimeseriesEntry {
  reportedValue?: RawNum;
}
interface TimeseriesResult {
  meta?: { type?: string[] };
  annualTotalAssets?: (TimeseriesEntry | null)[];
  annualStockholdersEquity?: (TimeseriesEntry | null)[];
}

const QUOTE_SUMMARY_MODULES = [
  "price",
  "summaryDetail",
  "defaultKeyStatistics",
  "financialData",
  "assetProfile",
  "calendarEvents",
].join(",");

// unix秒 -> ISO日付(YYYY-MM-DD)。配列で返ってくることがあるフィールドにも対応。
function unixToIsoDate(v: RawNum | RawNum[]): string | null {
  const first = Array.isArray(v) ? v[0] : v;
  const n = num(first);
  if (n == null) return null;
  return new Date(n * 1000).toISOString().slice(0, 10);
}

const YAHOO_RETRY_COUNT = 3;
const YAHOO_RETRY_BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// v10/finance/quoteSummary・fundamentals-timeseries はどちらもクッキー+crumbが必須なため、
// yahooAuth経由で取得する。crumbが失効している(401)場合は1回だけ強制リフレッシュして再試行する。
// 1550銘柄超のバッチスキャンでは同一セッションに短時間で大量のリクエストが集中するため、
// Yahoo側のレート制限(429)や一時的な5xxを1回の失敗として即座に諦めず、指数バックオフで
// 数回リトライする(これをしないと、レート制限に当たった銘柄の財務データだけがごっそり
// 欠落し、財務健全性スコア等が実態より低く出る/0点に張り付く原因になっていた)。
// (stockFinancials.tsからも同じ認証フローを再利用するためexportしている)
export async function fetchYahooAuthenticated(buildUrl: (crumb: string) => string): Promise<Response> {
  let auth = await getYahooAuth();
  const doFetch = () =>
    fetch(buildUrl(auth.crumb), {
      headers: { ...HEADERS, Cookie: auth.cookie },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

  let res = await doFetch();

  if (res.status === 401) {
    auth = await getYahooAuth(true);
    res = await doFetch();
  }

  for (let attempt = 0; attempt < YAHOO_RETRY_COUNT && (res.status === 429 || res.status >= 500); attempt++) {
    await sleep(YAHOO_RETRY_BASE_DELAY_MS * 2 ** attempt);
    res = await doFetch();
  }

  return res;
}

async function fetchQuoteSummary(ticker: string): Promise<QuoteSummaryResult | null> {
  const res = await fetchYahooAuthenticated(
    (crumb) =>
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
        ticker
      )}?modules=${QUOTE_SUMMARY_MODULES}&formatted=false&crumb=${encodeURIComponent(crumb)}`
  );
  if (!res.ok) return null;
  const json = await res.json();
  return (json?.quoteSummary?.result?.[0] as QuoteSummaryResult | undefined) ?? null;
}

// balanceSheetHistory(quoteSummary)は現在エンドデートのみで財務データを返さなくなっているため、
// yfinance等と同じく ws/fundamentals-timeseries から直近期の総資産・自己資本を取得する。
async function fetchEquityRatio(ticker: string): Promise<number | null> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 3 * 365 * 24 * 3600;

  const res = await fetchYahooAuthenticated(
    (crumb) =>
      `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(
        ticker
      )}?symbol=${encodeURIComponent(
        ticker
      )}&type=annualTotalAssets,annualStockholdersEquity&period1=${period1}&period2=${period2}&crumb=${encodeURIComponent(
        crumb
      )}`
  );
  if (!res.ok) return null;

  const json = await res.json();
  const results = (json?.timeseries?.result ?? []) as TimeseriesResult[];
  const assetsSeries = results.find((r) => r.meta?.type?.[0] === "annualTotalAssets")
    ?.annualTotalAssets ?? [];
  const equitySeries = results.find((r) => r.meta?.type?.[0] === "annualStockholdersEquity")
    ?.annualStockholdersEquity ?? [];

  const latestAssets = num(assetsSeries.filter(Boolean).at(-1)?.reportedValue);
  const latestEquity = num(equitySeries.filter(Boolean).at(-1)?.reportedValue);
  if (latestAssets == null || latestEquity == null || !latestAssets) return null;
  return round1((latestEquity / latestAssets) * 100);
}

// 配当履歴から暦年ごとの合計配当を集計し、直近の完了年から遡って連続増配した年数を数える
// (stock-analyzer/src/screener.py の _dividend_growth_years と同じ簡易ロジック)。
async function fetchDividendGrowthYears(ticker: string): Promise<number | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?range=10y&interval=3mo&events=div`;
  const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;

  const json = await res.json();
  const dividends = json?.chart?.result?.[0]?.events?.dividends;
  if (!dividends) return null;

  const byYear = new Map<number, number>();
  for (const key of Object.keys(dividends)) {
    const entry = dividends[key] as { amount: number; date: number };
    const year = new Date(entry.date * 1000).getFullYear();
    byYear.set(year, (byYear.get(year) ?? 0) + entry.amount);
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from(byYear.keys())
    .filter((y) => y < currentYear)
    .sort((a, b) => a - b);
  if (years.length === 0) return null;
  if (years.length < 2) return 0;

  let streak = 0;
  for (let i = years.length - 1; i > 0; i--) {
    const cur = byYear.get(years[i])!;
    const prev = byYear.get(years[i - 1])!;
    if (years[i] - years[i - 1] === 1 && cur > prev) streak++;
    else break;
  }
  return streak;
}

// quoteSummaryは株式向けのモジュール構成のため、コモディティ先物(GC=Fなど)や為替
// (JPY=Xなど)では対応していないことがある。その場合でもv8/finance/chartのmetaから
// 価格だけは取れることが多いので、フォールバックとして使う(財務指標は全てnullのまま)。
async function fetchChartMeta(ticker: string): Promise<{
  price: number | null;
  currency: string | null;
  name: string | null;
  quoteType: string | null;
  changePercent: number | null;
} | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`;
  const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") return null;

  const previousClose = meta.chartPreviousClose ?? meta.previousClose;
  const changePercent =
    typeof previousClose === "number" && previousClose !== 0
      ? round1(((meta.regularMarketPrice - previousClose) / previousClose) * 100)
      : null;

  return {
    price: meta.regularMarketPrice,
    currency: meta.currency ?? null,
    name: meta.shortName ?? meta.symbol ?? null,
    quoteType: meta.instrumentType ?? null,
    changePercent,
  };
}

export async function fetchStockMetrics(ticker: string): Promise<StockMetrics> {
  const empty: StockMetrics = {
    ticker,
    name: null,
    sector: null,
    industry: null,
    currency: null,
    price: null,
    dayChangePercent: null,
    marketCap: null,
    per: null,
    pbr: null,
    roe: null,
    equityRatio: null,
    operatingMargin: null,
    dividendYield: null,
    payoutRatio: null,
    dividendGrowthYears: null,
    debtToEquity: null,
    currentRatio: null,
    revenueGrowth: null,
    earningsGrowth: null,
    beta: null,
    priceVs50ma: null,
    priceVs200ma: null,
    volumeRatio: null,
    targetMeanPrice: null,
    targetHighPrice: null,
    targetLowPrice: null,
    targetMedianPrice: null,
    numberOfAnalystOpinions: null,
    recommendationKey: null,
    earningsDate: null,
    exDividendDate: null,
    trailingEps: null,
    bookValuePerShare: null,
    grahamNumber: null,
    longBusinessSummary: null,
    quoteType: null,
  };

  try {
    const [summary, equityRatio, dividendGrowthYears] = await Promise.all([
      fetchQuoteSummary(ticker),
      fetchEquityRatio(ticker).catch(() => null),
      fetchDividendGrowthYears(ticker).catch(() => null),
    ]);

    if (!summary) {
      // 株式向けの財務データが無い銘柄(コモディティ先物・為替など)向けのフォールバック。
      const chartMeta = await fetchChartMeta(ticker).catch(() => null);
      if (!chartMeta) return { ...empty, error: "financial data not found" };
      return {
        ...empty,
        name: chartMeta.name,
        currency: chartMeta.currency,
        price: chartMeta.price,
        dayChangePercent: chartMeta.changePercent,
        quoteType: chartMeta.quoteType,
      };
    }

    const price = summary.price ?? {};
    const summaryDetail = summary.summaryDetail ?? {};
    const keyStats = summary.defaultKeyStatistics ?? {};
    const financialData = summary.financialData ?? {};
    const profile = summary.assetProfile ?? {};
    const calendarEvents = summary.calendarEvents ?? {};

    const currentPrice = num(price.regularMarketPrice);
    const ma50 = num(summaryDetail.fiftyDayAverage);
    const ma200 = num(summaryDetail.twoHundredDayAverage);
    const volume = num(price.regularMarketVolume);
    const avgVolume = num(summaryDetail.averageVolume10days) ?? num(summaryDetail.averageVolume);

    const trailingEps = num(keyStats.trailingEps);
    const bookValuePerShare = num(keyStats.bookValue);
    // グレアムナンバー: ベンジャミン・グレアムが提唱した割安株の目安株価。
    // 赤字(EPS<=0)や債務超過(BPS<=0)では意味を持たないため、その場合はnullのまま出す。
    const grahamNumber =
      trailingEps != null && trailingEps > 0 && bookValuePerShare != null && bookValuePerShare > 0
        ? round1(Math.sqrt(22.5 * trailingEps * bookValuePerShare))
        : null;

    return {
      ticker,
      name: price.shortName ?? price.longName ?? null,
      sector: profile.sector ?? null,
      industry: profile.industry ?? null,
      longBusinessSummary: profile.longBusinessSummary ?? null,
      currency: price.currency ?? null,
      price: currentPrice,
      dayChangePercent: pct(price.regularMarketChangePercent),
      marketCap: num(price.marketCap),
      per: num(summaryDetail.trailingPE),
      pbr: num(keyStats.priceToBook),
      roe: pct(financialData.returnOnEquity),
      equityRatio,
      operatingMargin: pct(financialData.operatingMargins),
      dividendYield: pct(summaryDetail.dividendYield),
      payoutRatio: pct(summaryDetail.payoutRatio),
      dividendGrowthYears,
      debtToEquity: num(financialData.debtToEquity),
      currentRatio: num(financialData.currentRatio),
      revenueGrowth: pct(financialData.revenueGrowth),
      earningsGrowth: pct(financialData.earningsGrowth),
      beta: num(keyStats.beta),
      priceVs50ma:
        currentPrice && ma50 ? round1((currentPrice / ma50 - 1) * 100) : null,
      priceVs200ma:
        currentPrice && ma200 ? round1((currentPrice / ma200 - 1) * 100) : null,
      volumeRatio:
        volume && avgVolume ? Math.round((volume / avgVolume) * 100) / 100 : null,
      targetMeanPrice: num(financialData.targetMeanPrice),
      targetHighPrice: num(financialData.targetHighPrice),
      targetLowPrice: num(financialData.targetLowPrice),
      targetMedianPrice: num(financialData.targetMedianPrice),
      numberOfAnalystOpinions: num(financialData.numberOfAnalystOpinions),
      recommendationKey:
        financialData.recommendationKey && financialData.recommendationKey !== "none"
          ? financialData.recommendationKey
          : null,
      earningsDate: unixToIsoDate(calendarEvents.earnings?.earningsDate ?? null),
      exDividendDate: unixToIsoDate(calendarEvents.exDividendDate ?? null),
      trailingEps,
      bookValuePerShare,
      grahamNumber,
      quoteType: price.quoteType ?? null,
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "unknown error" };
  }
}

export function marketRegion(metrics: Pick<StockMetrics, "currency" | "ticker">): "jp" | "us" {
  if (metrics.currency === "JPY" || metrics.ticker.endsWith(".T")) return "jp";
  return "us";
}

// 銀行・保険・証券などの金融セクターは、預金や保険契約準備金が負債計上される業態上、
// 自己資本比率が構造的に低くなる(メガバンクでも数%台が普通)。一般事業会社向けの
// 「自己資本比率は高いほど健全」という閾値をそのまま当てはめると誤診断になるため、
// 自己資本比率に基づく判定(ゲージ・良い点/懸念点・財務健全性スコア)から除外する。
export function isFinancialSector(sector: string | null): boolean {
  return sector === "Financial Services";
}
