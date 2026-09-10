import calibration from "./data/usForecastCalibration.json";

// 「1ヶ月先(20営業日)の株価傾向」— 機械学習によるブラックボックス予測ではなく、
// 「過去、同じような状況(価格ベースのトレンドスコア × 対S&P500相対力)だった時に、
// 実際どうなっていたか」という素朴な条件付き集計(ヒストリカルベースレート)。
// S&P500の約500銘柄×過去約9年の実データを事前に集計した静的データ(usForecastCalibration.json、
// scratchpad/forecast_calibration.mjsで生成)を参照するだけで、都度計算はしない。
// 米国株専用(S&P500データで較正しているため)。将来の値動きを保証するものではない。

export type MomentumBucket = "high" | "mid" | "low";
export type RsBucket = "weak" | "moderate" | "strong" | "veryStrong";

interface BucketStats {
  sampleSize: number;
  winRatePct: number;
  meanReturnPct: number;
  medianReturnPct: number;
  p10ReturnPct: number;
  p90ReturnPct: number;
}

interface CalibrationData {
  forwardTradingDays: number;
  universe: string;
  generatedFrom: { start: string; end: string };
  tickerCount: number;
  buckets: Record<string, BucketStats>;
}

const DATA = calibration as CalibrationData;
const MIN_SAMPLE_SIZE = 300; // これ未満のバケットは参考にならないため表示しない

export interface UsForecast extends BucketStats {
  momentumBucket: MomentumBucket;
  momentumLabel: string;
  rsBucket: RsBucket;
  rsLabel: string;
  forwardTradingDays: number;
  universe: string;
  generatedFrom: { start: string; end: string };
}

function momentumBucketOf(score: number): MomentumBucket {
  if (score >= 6) return "high";
  if (score >= 4) return "mid";
  return "low";
}

function rsBucketOf(diffPct: number): RsBucket {
  if (diffPct < 0) return "weak";
  if (diffPct < 15) return "moderate";
  if (diffPct < 30) return "strong";
  return "veryStrong";
}

const MOMENTUM_LABEL: Record<MomentumBucket, string> = {
  high: "強い上昇トレンド(価格ベース7点満点中6点以上)",
  mid: "中程度のトレンド(4〜5点)",
  low: "弱いトレンド(0〜3点)",
};

const RS_LABEL: Record<RsBucket, string> = {
  veryStrong: "対S&P500で非常に強い(6ヶ月騰落率差+30pt以上)",
  strong: "対S&P500で強い(+15〜30pt)",
  moderate: "対S&P500で並(0〜15pt)",
  weak: "対S&P500で劣後(マイナス)",
};

// priceOnlyMomentumScore: ミネルヴィニ・トレンドテンプレートのうち、価格・移動平均線ベースの
// 7条件だけのスコア(0-7)。アプリのcomputeMinerviniTemplateは対ベンチマーク相対力を8条件目に
// 含むため、呼び出し側でその1点を除いてから渡すこと(RS軸と二重に評価しないため)。
export function computeUsForecast(priceOnlyMomentumScore: number, relativeStrengthPct: number | null): UsForecast | null {
  if (relativeStrengthPct == null) return null;
  const m = momentumBucketOf(priceOnlyMomentumScore);
  const r = rsBucketOf(relativeStrengthPct);
  const key = `${m}|${r}`;
  const stats = DATA.buckets[key];
  if (!stats || stats.sampleSize < MIN_SAMPLE_SIZE) return null;
  return {
    ...stats,
    momentumBucket: m,
    momentumLabel: MOMENTUM_LABEL[m],
    rsBucket: r,
    rsLabel: RS_LABEL[r],
    forwardTradingDays: DATA.forwardTradingDays,
    universe: DATA.universe,
    generatedFrom: DATA.generatedFrom,
  };
}
