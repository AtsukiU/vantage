import type { StockMetrics } from "./stockMetrics";
import type { TechnicalAnalysis } from "./stockTechnicals";

export interface HorizonEntry {
  horizon: "長期" | "中期" | "短期";
  verdict: string;
  description: string;
  good: boolean;
}

// stock-analyzerの投資期間タブ(長期/中期/短期)と同じ考え方で、テクニカル指標を
// 期間ごとに読み替えて短い所見にまとめる。ルールベースの機械的な判定であり、
// 投資判断そのものを保証するものではない。
export function buildHorizonAnalysis(
  metrics: StockMetrics,
  technicals: TechnicalAnalysis
): HorizonEntry[] {
  const entries: HorizonEntry[] = [];

  // 長期: 200日移動平均線からの乖離
  const vs200 = metrics.priceVs200ma;
  if (vs200 == null) {
    entries.push({
      horizon: "長期",
      verdict: "データ不足",
      description: "200日移動平均線のデータが不足しているため判定できません",
      good: false,
    });
  } else if (vs200 >= 5) {
    entries.push({
      horizon: "長期",
      verdict: "上昇トレンド",
      description: `200日移動平均線を${vs200.toFixed(1)}%上回って推移。長期的な上昇基調が継続している`,
      good: true,
    });
  } else if (vs200 <= -5) {
    entries.push({
      horizon: "長期",
      verdict: "下降トレンド",
      description: `200日移動平均線を${Math.abs(vs200).toFixed(1)}%下回って推移。長期的な下落基調が続いている`,
      good: false,
    });
  } else {
    entries.push({
      horizon: "長期",
      verdict: "方向感なし",
      description: "200日移動平均線付近で推移しており、明確なトレンドは出ていない",
      good: false,
    });
  }

  // 中期: ゴールデンクロス/デッドクロス・MACD・50日移動平均線
  const cross = technicals.patterns.find(
    (p) => p.key === "golden_cross" || p.key === "dead_cross"
  );
  const macdHistogram = technicals.macd?.histogram ?? null;
  if (cross?.key === "golden_cross") {
    entries.push({
      horizon: "中期",
      verdict: "上昇継続",
      description:
        cross.description +
        (macdHistogram != null
          ? `。MACDも${macdHistogram > 0 ? "プラス圏" : "マイナス圏"}(${macdHistogram})で推移`
          : ""),
      good: true,
    });
  } else if (cross?.key === "dead_cross") {
    entries.push({
      horizon: "中期",
      verdict: "下降警戒",
      description: cross.description,
      good: false,
    });
  } else if (macdHistogram != null && macdHistogram > 0) {
    entries.push({
      horizon: "中期",
      verdict: "底堅い",
      description: `MACDがプラス圏(${macdHistogram})で推移し、中期的な上昇圧力を示す`,
      good: true,
    });
  } else if (macdHistogram != null && macdHistogram < 0) {
    entries.push({
      horizon: "中期",
      verdict: "軟調",
      description: `MACDがマイナス圏(${macdHistogram})で推移し、中期的な下落圧力を示す`,
      good: false,
    });
  } else {
    entries.push({
      horizon: "中期",
      verdict: "中立",
      description: "明確な中期シグナルは出ていない",
      good: false,
    });
  }

  // 短期: RSI・ボリンジャーバンド・チャートパターン
  const rsi = technicals.rsi14;
  const rsiPhrase =
    rsi == null
      ? null
      : rsi >= 70
      ? `RSI(14)は${rsi}で買われすぎ水準(70)を上回っている`
      : rsi <= 30
      ? `RSI(14)は${rsi}で売られすぎ水準(30)を下回っている`
      : `RSI(14)は${rsi}で中立圏、買われすぎ水準(70)には未達`;

  const shapePatterns = technicals.patterns.filter(
    (p) => p.key === "cup_with_handle" || p.key === "double_bottom"
  );
  const shapeDescriptions = shapePatterns.map((p) => p.description);
  const shortDescription = [rsiPhrase, ...shapeDescriptions].filter(Boolean).join("。");

  let shortVerdict = "過熱感なし";
  let shortGood = shapePatterns.length > 0;
  if (rsi != null && rsi >= 70) {
    shortVerdict = "過熱感あり";
    shortGood = false;
  } else if (rsi != null && rsi <= 30) {
    shortVerdict = "売られすぎ";
    shortGood = false;
  } else if (shapePatterns.length > 0) {
    shortVerdict = "反発シグナル";
  }

  entries.push({
    horizon: "短期",
    verdict: shortVerdict,
    description: shortDescription || "短期的な特徴的シグナルは出ていない",
    good: shortGood,
  });

  return entries;
}
