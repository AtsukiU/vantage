import { movingAverage } from "./stockChart";
import { buildScoreResult, type ScoreResult } from "./checklistTypes";

// マーク・ミネルヴィニの「トレンドテンプレート」(8条件)をTypeScriptで再現したもの。
// 本人の定義は概ね: (1)(2)株価が150日線・200日線の上、(3)150日線が200日線の上、
// (4)200日線が最低1ヶ月上昇トレンド、(5)50日線が150日線・200日線の上、(6)株価が50日線の上、
// (7)株価が52週安値から最低30%上、(8)株価が52週高値から最大25%以内、(9)相対力(RSレーティング)が高い。
// ここでは(1)(2)を1条件にまとめ、RSレーティングの代わりにベンチマーク指数に対する6ヶ月騰落率差を
// 簡易的な相対力の目安として使う(IBD公式のRSレーティングとは算出方法が異なる点に注意)。

export function computeMinerviniTemplate(closes: number[], relativeStrengthPct: number | null): ScoreResult {
  const ma50Series = movingAverage(closes, 50);
  const ma150Series = movingAverage(closes, 150);
  const ma200Series = movingAverage(closes, 200);
  const price = closes[closes.length - 1] ?? null;
  const ma50 = ma50Series[ma50Series.length - 1];
  const ma150 = ma150Series[ma150Series.length - 1];
  const ma200 = ma200Series[ma200Series.length - 1];

  const monthAgoIdx = ma200Series.length - 1 - 21;
  const ma200MonthAgo = monthAgoIdx >= 0 ? ma200Series[monthAgoIdx] : null;
  const ma200TrendingUp = ma200 != null && ma200MonthAgo != null && ma200 > ma200MonthAgo;

  const week52Window = closes.slice(-252);
  const week52High = week52Window.length ? Math.max(...week52Window) : null;
  const week52Low = week52Window.length ? Math.min(...week52Window) : null;

  const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("ja-JP", { maximumFractionDigits: 1 }));

  const priceAbove150And200 = price != null && ma150 != null && ma200 != null && price > ma150 && price > ma200;
  const ma150Above200 = ma150 != null && ma200 != null && ma150 > ma200;
  const ma50Above150And200 = ma50 != null && ma150 != null && ma200 != null && ma50 > ma150 && ma50 > ma200;
  const priceAbove50 = price != null && ma50 != null && price > ma50;
  const above52wLowBy30 = price != null && week52Low != null && price >= week52Low * 1.3;
  const within25OfHigh = price != null && week52High != null && price >= week52High * 0.75;
  const strongRelativeStrength = relativeStrengthPct != null && relativeStrengthPct > 0;

  return buildScoreResult([
    {
      key: "price_above_150_200",
      label: "株価が150日線・200日線の上",
      pass: priceAbove150And200,
      detail: `株価${fmt(price)} / 150日線${fmt(ma150)} / 200日線${fmt(ma200)}`,
    },
    {
      key: "ma150_above_200",
      label: "150日線が200日線の上",
      pass: ma150Above200,
      detail: `150日線${fmt(ma150)} / 200日線${fmt(ma200)}`,
    },
    {
      key: "ma200_trending_up",
      label: "200日線が上昇トレンド(直近1ヶ月)",
      pass: ma200TrendingUp,
      detail: ma200 != null && ma200MonthAgo != null ? `1ヶ月前${fmt(ma200MonthAgo)} → 現在${fmt(ma200)}` : "データ不足",
    },
    {
      key: "ma50_above_150_200",
      label: "50日線が150日線・200日線の上",
      pass: ma50Above150And200,
      detail: `50日線${fmt(ma50)} / 150日線${fmt(ma150)} / 200日線${fmt(ma200)}`,
    },
    {
      key: "price_above_50",
      label: "株価が50日線の上",
      pass: priceAbove50,
      detail: `株価${fmt(price)} / 50日線${fmt(ma50)}`,
    },
    {
      key: "above_52w_low",
      label: "52週安値から30%以上上",
      pass: above52wLowBy30,
      detail: week52Low != null && price != null ? `安値比+${(((price - week52Low) / week52Low) * 100).toFixed(1)}%` : "データ不足",
    },
    {
      key: "near_52w_high",
      label: "52週高値から25%以内",
      pass: within25OfHigh,
      detail: week52High != null && price != null ? `高値比${(((price - week52High) / week52High) * 100).toFixed(1)}%` : "データ不足",
    },
    {
      key: "relative_strength",
      label: "市場平均に対して相対的に強い(目安)",
      pass: strongRelativeStrength,
      detail:
        relativeStrengthPct != null
          ? `対ベンチマーク6ヶ月騰落率差 ${relativeStrengthPct >= 0 ? "+" : ""}${relativeStrengthPct.toFixed(1)}pt`
          : "データ不足",
    },
  ]);
}
