// 過去5年分の「トレンドフォロー」戦略バックテスト。
//
// 運用アドバイザーの実際の判断(投資委員会スコア・財務指標・アナリスト動向など)は
// 「今日時点」の生データしか取得できず、過去の日付における値を再構成する手段がないため、
// そのまま過去に遡って検証することはできない(personaRules.ts / committeeScore.ts参照)。
// そこで、唯一5年分の実データが取れる「株価」だけを使い、トレンドフォロー
// (ミネルヴィニ型)アドバイザーの考え方を単純化した規則――「200日移動平均線を上回っている
// 銘柄だけを毎月末に均等配分で保有し、上回っていない月はその銘柄分を現金で待機する」――で
// 過去5年をシミュレーションし、S&P500の同期間の実際の騰落(配当再投資なし)と比較する。
//
// 前提と簡略化(UI側にも必ず明記すること):
// ・銘柄選定は現在の保有銘柄/ウォッチリストに限定(過去の市場全体スキャンは再現不可能なため)
// ・為替変動の影響は含めない(各銘柄の現地通貨ベースの騰落率をそのまま合成)
// ・配当・手数料は考慮しない
// ・月末リバランスの均等配分という簡易モデルであり、実際の運用アドバイザーの判断ロジックとは異なる

import { fetchRawPriceSeriesRanged, movingAverage } from "./stockChart";

const BENCHMARK_TICKER = "^GSPC";
const BENCHMARK_LABEL = "S&P500";
const BACKTEST_YEARS = 5;
const SMA_PERIOD = 200;
const MIN_TOTAL_POINTS = 250; // これ未満のデータしか無い銘柄はバックテストから除外する

interface LoadedSeries {
  ticker: string;
  dates: string[];
  closes: number[];
  sma: (number | null)[];
}

export interface BacktestPoint {
  date: string;
  portfolioValue: number;
  benchmarkValue: number;
  /** その月に実際に保有していた銘柄数(0=全額現金) */
  heldCount: number;
}

export interface BacktestResult {
  startDate: string;
  endDate: string;
  startCapital: number;
  points: BacktestPoint[];
  usedTickers: string[];
  excludedTickers: string[];
  benchmarkLabel: string;
  portfolioEndValue: number;
  benchmarkEndValue: number;
  portfolioTotalReturnPercent: number;
  benchmarkTotalReturnPercent: number;
  portfolioCagrPercent: number;
  benchmarkCagrPercent: number;
}

async function loadSeries(ticker: string): Promise<LoadedSeries | null> {
  const raw = await fetchRawPriceSeriesRanged(ticker, "10y");
  if (raw.dates.length < MIN_TOTAL_POINTS) return null;
  const sma = movingAverage(raw.closes, SMA_PERIOD);
  return { ticker, dates: raw.dates, closes: raw.closes, sma };
}

// 対象日以前で最新のインデックスを返す(データが無ければ-1)。
function indexAtOrBefore(dates: string[], targetDate: string): number {
  let idx = -1;
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] <= targetDate) idx = i;
    else break;
  }
  return idx;
}

function addYearsIso(dateIso: string, years: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

// ベンチマーク系列を基準に、5年ウィンドウ内の「各月最後の取引日」の一覧を作る。
function monthEndDates(dates: string[], windowStart: string): string[] {
  const filtered = dates.filter((d) => d >= windowStart);
  const out: string[] = [];
  for (let i = 0; i < filtered.length; i++) {
    const cur = filtered[i];
    const next = filtered[i + 1];
    if (!next || next.slice(0, 7) !== cur.slice(0, 7)) out.push(cur);
  }
  return out;
}

function cagrPercent(startValue: number, endValue: number, startDate: string, endDate: string): number {
  const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000;
  const years = days / 365.25;
  if (years <= 0 || startValue <= 0) return 0;
  return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
}

export async function runTrendBacktest(tickers: string[], startCapital = 1_000_000): Promise<BacktestResult> {
  const uniqueTickers = Array.from(new Set(tickers.map((t) => t.trim()).filter(Boolean)));
  if (uniqueTickers.length === 0) {
    throw new Error("対象銘柄がありません");
  }

  const [benchmarkRaw, ...seriesResults] = await Promise.all([
    fetchRawPriceSeriesRanged(BENCHMARK_TICKER, "10y"),
    ...uniqueTickers.map((t) => loadSeries(t)),
  ]);

  if (benchmarkRaw.dates.length < MIN_TOTAL_POINTS) {
    throw new Error("S&P500の価格データを取得できませんでした");
  }

  const validSeries = seriesResults.filter((s): s is LoadedSeries => s != null);
  const excludedTickers = uniqueTickers.filter((t) => !validSeries.some((s) => s.ticker === t));

  if (validSeries.length === 0) {
    throw new Error("十分な価格データを持つ銘柄がありませんでした");
  }

  const latestDate = benchmarkRaw.dates[benchmarkRaw.dates.length - 1];
  const windowStart = addYearsIso(latestDate, -BACKTEST_YEARS);

  const t0Index = benchmarkRaw.dates.findIndex((d) => d >= windowStart);
  if (t0Index === -1) {
    throw new Error("5年分の価格データが不足しています");
  }
  const t0Date = benchmarkRaw.dates[t0Index];
  const benchmarkStartClose = benchmarkRaw.closes[t0Index];

  const rebalanceDates = monthEndDates(benchmarkRaw.dates, windowStart).filter((d) => d > t0Date);
  const timeline = [t0Date, ...rebalanceDates];

  const points: BacktestPoint[] = [
    { date: t0Date, portfolioValue: startCapital, benchmarkValue: startCapital, heldCount: 0 },
  ];

  let portfolioValue = startCapital;
  let prevDate = t0Date;

  for (let i = 1; i < timeline.length; i++) {
    const curDate = timeline[i];

    const selected: number[] = [];
    for (const s of validSeries) {
      const prevIdx = indexAtOrBefore(s.dates, prevDate);
      if (prevIdx === -1) continue;
      const prevSma = s.sma[prevIdx];
      const prevClose = s.closes[prevIdx];
      if (prevSma == null || !(prevClose > prevSma)) continue; // 前月末時点で200日線を上回っていない=非採用

      const curIdx = indexAtOrBefore(s.dates, curDate);
      if (curIdx === -1) continue;
      const curClose = s.closes[curIdx];
      selected.push(curClose / prevClose - 1);
    }

    const periodReturn = selected.length > 0 ? selected.reduce((sum, r) => sum + r, 0) / selected.length : 0;
    portfolioValue *= 1 + periodReturn;

    const benchIdx = indexAtOrBefore(benchmarkRaw.dates, curDate);
    const benchmarkClose = benchIdx === -1 ? benchmarkStartClose : benchmarkRaw.closes[benchIdx];
    const benchmarkValue = startCapital * (benchmarkClose / benchmarkStartClose);

    points.push({ date: curDate, portfolioValue, benchmarkValue, heldCount: selected.length });
    prevDate = curDate;
  }

  const last = points[points.length - 1];

  return {
    startDate: t0Date,
    endDate: last.date,
    startCapital,
    points,
    usedTickers: validSeries.map((s) => s.ticker),
    excludedTickers,
    benchmarkLabel: BENCHMARK_LABEL,
    portfolioEndValue: last.portfolioValue,
    benchmarkEndValue: last.benchmarkValue,
    portfolioTotalReturnPercent: (last.portfolioValue / startCapital - 1) * 100,
    benchmarkTotalReturnPercent: (last.benchmarkValue / startCapital - 1) * 100,
    portfolioCagrPercent: cagrPercent(startCapital, last.portfolioValue, t0Date, last.date),
    benchmarkCagrPercent: cagrPercent(startCapital, last.benchmarkValue, t0Date, last.date),
  };
}
