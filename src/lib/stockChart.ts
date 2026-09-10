export type ChartRange = "1mo" | "6mo" | "1y" | "2y";

export interface PricePoint {
  date: string; // ISO date (YYYY-MM-DD)
  close: number;
  ma50: number | null;
  ma200: number | null;
}

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; StockNewsApp/1.0)" };

const RANGE_DAYS: Record<ChartRange, number> = {
  "1mo": 22,
  "6mo": 130,
  "1y": 260,
  "2y": 520,
};

export function movingAverage(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export interface RawPriceSeries {
  dates: string[];
  closes: number[];
}

// チャート表示・テクニカル分析の両方が同じ3年分の日次終値を使えるように、生の系列取得だけを
// 切り出しておく(呼び出し側でMA計算や期間の切り出しを行う)。
export async function fetchRawPriceSeries(ticker: string): Promise<RawPriceSeries> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?range=3y&interval=1d`;
  const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) return { dates: [], closes: [] };

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return { dates: [], closes: [] };

  const timestamps: number[] = result.timestamp ?? [];
  const rawCloses: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

  const dates: string[] = [];
  const closes: number[] = [];
  timestamps.forEach((ts, i) => {
    const close = rawCloses[i];
    if (close == null) return;
    dates.push(new Date(ts * 1000).toISOString().slice(0, 10));
    closes.push(close);
  });

  return { dates, closes };
}

// スクリーニング結果カードのミニチャート用の軽量な終値取得(直近3ヶ月分のみ)。
export async function fetchSparkline(ticker: string, days = 60): Promise<number[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?range=3mo&interval=1d`;
  const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];

  const json = await res.json();
  const closes: (number | null)[] = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  return closes.filter((c): c is number => c != null).slice(-days);
}

// 移動平均線を正しく描くには表示期間より長い履歴が要るため、常に3年分を取得してから
// 末尾を必要な期間だけ切り出す。
export async function fetchPriceHistory(
  ticker: string,
  range: ChartRange = "1y"
): Promise<PricePoint[]> {
  const { dates, closes } = await fetchRawPriceSeries(ticker);

  const ma50 = movingAverage(closes, 50);
  const ma200 = movingAverage(closes, 200);

  const points: PricePoint[] = dates.map((date, i) => ({
    date,
    close: closes[i],
    ma50: ma50[i],
    ma200: ma200[i],
  }));

  const days = RANGE_DAYS[range];
  return points.slice(-days);
}
