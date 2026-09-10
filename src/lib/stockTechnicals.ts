import { fetchRawPriceSeries, movingAverage } from "./stockChart";

export interface PatternMatch {
  key: string;
  label: string;
  description: string;
}

export interface TechnicalAnalysis {
  rsi14: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  bollinger: { upper: number; middle: number; lower: number; percentB: number } | null;
  trend: "uptrend" | "downtrend" | "range";
  week52High: number | null;
  week52Low: number | null;
  pctFromWeek52High: number | null; // 0以下(高値からの下落率)
  pctFromWeek52Low: number | null; // 0以上(安値からの上昇率)
  patterns: PatternMatch[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// RSI(14) — Wilderのスムージング方式
function computeRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return round1(100 - 100 / (1 + rs));
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  values.forEach((v, i) => {
    out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k));
  });
  return out;
}

function computeMACD(
  closes: number[]
): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < 35) return null;
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = closes.map((_, i) => ema12[i] - ema26[i]);
  const signalLine = ema(macdLine, 9);
  const last = closes.length - 1;
  return {
    macd: round2(macdLine[last]),
    signal: round2(signalLine[last]),
    histogram: round2(macdLine[last] - signalLine[last]),
  };
}

function computeBollinger(
  closes: number[]
): { upper: number; middle: number; lower: number; percentB: number } | null {
  const period = 20;
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = mean + 2 * sd;
  const lower = mean - 2 * sd;
  const last = closes[closes.length - 1];
  const percentB = upper === lower ? 50 : ((last - lower) / (upper - lower)) * 100;
  return { upper: round2(upper), middle: round2(mean), lower: round2(lower), percentB: round1(percentB) };
}

function classifyTrend(
  price: number,
  ma50: number | null,
  ma200: number | null
): "uptrend" | "downtrend" | "range" {
  if (ma50 == null || ma200 == null) return "range";
  if (price > ma50 && ma50 > ma200) return "uptrend";
  if (price < ma50 && ma50 < ma200) return "downtrend";
  return "range";
}

function findRecentCross(
  ma50: (number | null)[],
  ma200: (number | null)[],
  dates: string[],
  lookback = 90
): PatternMatch | null {
  const n = ma50.length;
  const start = Math.max(1, n - lookback);
  for (let i = n - 1; i >= start; i--) {
    const a0 = ma50[i - 1];
    const b0 = ma200[i - 1];
    const a1 = ma50[i];
    const b1 = ma200[i];
    if (a0 == null || b0 == null || a1 == null || b1 == null) continue;
    const prevDiff = a0 - b0;
    const curDiff = a1 - b1;
    if (prevDiff <= 0 && curDiff > 0) {
      return {
        key: "golden_cross",
        label: "ゴールデンクロス",
        description: `${dates[i]}に50日移動平均線が200日線を上抜け。中期的な上昇転換のサインとされる`,
      };
    }
    if (prevDiff >= 0 && curDiff < 0) {
      return {
        key: "dead_cross",
        label: "デッドクロス",
        description: `${dates[i]}に50日移動平均線が200日線を下抜け。中期的な下降転換のサインとされる`,
      };
    }
  }
  return null;
}

// カップウィズハンドル(オニール型)の簡易ヒューリスティック検出。
// 直近130営業日を対象に、(1) 左リム(高値)→カップ底(12〜40%下落)→リム近辺まで回復、
// (2) 回復後の直近で浅い調整(ハンドル、2〜18%程度)が見られるかを機械的にチェックする。
// あくまで形状の近似判定であり、出来高など他の裏付けは見ていない参考情報。
function detectCupWithHandle(closes: number[]): PatternMatch | null {
  const window = Math.min(130, closes.length);
  if (window < 40) return null;
  const series = closes.slice(-window);
  const n = series.length;

  const handleStart = Math.floor(n * 0.85);
  const cupSearchEnd = handleStart;

  let leftRimIdx = 0;
  for (let i = 0; i < Math.floor(n * 0.4); i++) {
    if (series[i] > series[leftRimIdx]) leftRimIdx = i;
  }
  const leftRim = series[leftRimIdx];

  let bottomIdx = leftRimIdx;
  for (let i = leftRimIdx; i < cupSearchEnd; i++) {
    if (series[i] < series[bottomIdx]) bottomIdx = i;
  }
  const bottom = series[bottomIdx];
  if (bottomIdx <= leftRimIdx) return null;

  const cupDepthPct = ((leftRim - bottom) / leftRim) * 100;
  if (cupDepthPct < 10 || cupDepthPct > 40) return null;

  let rightRimIdx = bottomIdx;
  for (let i = bottomIdx; i < cupSearchEnd; i++) {
    if (series[i] > series[rightRimIdx]) rightRimIdx = i;
  }
  const rightRim = series[rightRimIdx];
  const recoveryRatio = (rightRim - bottom) / (leftRim - bottom);
  if (recoveryRatio < 0.75) return null;

  const handleSlice = series.slice(handleStart);
  if (handleSlice.length < 3) return null;
  const handleHigh = Math.max(...handleSlice);
  const handleLow = Math.min(...handleSlice);
  const handleDepthPct = ((handleHigh - handleLow) / handleHigh) * 100;
  if (handleDepthPct < 2 || handleDepthPct > 18) return null;
  if (handleHigh < rightRim * 0.85) return null;

  const last = series[n - 1];
  const nearBreakout = last >= handleHigh * 0.97;

  return {
    key: "cup_with_handle",
    label: "カップウィズハンドル",
    description: `高値から約${cupDepthPct.toFixed(
      0
    )}%下落したあと回復し、直近${handleDepthPct.toFixed(0)}%程度の浅い調整(ハンドル)を形成${
      nearBreakout ? "。ハンドル高値付近まで戻っており、ブレイクアウトが近い可能性" : ""
    }`,
  };
}

// ダブルボトム(W字)の簡易検出。近い水準の安値2つとその間の反発高値を、
// 局所的な極小値の総当たりで探す。
function detectDoubleBottom(closes: number[]): PatternMatch | null {
  const window = Math.min(150, closes.length);
  if (window < 40) return null;
  const series = closes.slice(-window);
  const n = series.length;

  const troughs: number[] = [];
  for (let i = 2; i < n - 2; i++) {
    if (
      series[i] < series[i - 1] &&
      series[i] < series[i - 2] &&
      series[i] < series[i + 1] &&
      series[i] < series[i + 2]
    ) {
      troughs.push(i);
    }
  }
  if (troughs.length < 2) return null;

  for (let a = 0; a < troughs.length; a++) {
    for (let b = a + 1; b < troughs.length; b++) {
      const i1 = troughs[a];
      const i2 = troughs[b];
      if (i2 - i1 < 15) continue;
      const v1 = series[i1];
      const v2 = series[i2];
      const diffPct = (Math.abs(v1 - v2) / Math.min(v1, v2)) * 100;
      if (diffPct > 6) continue;
      const peak = Math.max(...series.slice(i1, i2));
      const risePct = ((peak - Math.max(v1, v2)) / Math.max(v1, v2)) * 100;
      if (risePct < 8) continue;
      const last = series[n - 1];
      const recovered = last >= peak * 0.95;
      return {
        key: "double_bottom",
        label: "ダブルボトム",
        description: recovered
          ? "近い水準の安値を2回つけたあと反発し、中間高値付近まで回復。底打ち・反転のサインとされる形状"
          : "近い水準の安値を2回つけたあと反発している。底打ち・反転のサインとされる形状",
      };
    }
  }
  return null;
}

export function analyzeTechnicals(dates: string[], closes: number[]): TechnicalAnalysis {
  if (closes.length === 0) {
    return {
      rsi14: null,
      macd: null,
      bollinger: null,
      trend: "range",
      week52High: null,
      week52Low: null,
      pctFromWeek52High: null,
      pctFromWeek52Low: null,
      patterns: [],
    };
  }

  const ma50 = movingAverage(closes, 50);
  const ma200 = movingAverage(closes, 200);
  const price = closes[closes.length - 1];

  const week52Window = closes.slice(-252);
  const week52High = Math.max(...week52Window);
  const week52Low = Math.min(...week52Window);

  const patterns: PatternMatch[] = [];
  const cross = findRecentCross(ma50, ma200, dates);
  if (cross) patterns.push(cross);
  const cup = detectCupWithHandle(closes);
  if (cup) patterns.push(cup);
  const doubleBottom = detectDoubleBottom(closes);
  if (doubleBottom) patterns.push(doubleBottom);

  return {
    rsi14: computeRSI(closes),
    macd: computeMACD(closes),
    bollinger: computeBollinger(closes),
    trend: classifyTrend(price, ma50[ma50.length - 1], ma200[ma200.length - 1]),
    week52High: round2(week52High),
    week52Low: round2(week52Low),
    pctFromWeek52High: round1(((price - week52High) / week52High) * 100),
    pctFromWeek52Low: round1(((price - week52Low) / week52Low) * 100),
    patterns,
  };
}

export async function fetchTechnicalAnalysis(ticker: string): Promise<TechnicalAnalysis> {
  const { dates, closes } = await fetchRawPriceSeries(ticker);
  return analyzeTechnicals(dates, closes);
}
