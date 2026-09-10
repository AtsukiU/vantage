import { isFinancialSector, type StockMetrics } from "./stockMetrics";

export interface StockInsight {
  characteristics: string[];
  strengths: string[];
  concerns: string[];
}

// stock-analyzer/src/insights.py の analyze() と同じルールベースのしきい値判定をTypeScriptに移植したもの。
// LLMは使わず、取得できた財務データをあらかじめ決めたしきい値と突き合わせて短いコメントを組み立てるだけ。
// あくまで参考情報であり、投資判断の正しさを保証するものではない。

function marketCapTier(marketCap: number | null, currency: string | null): string | null {
  if (marketCap == null) return null;
  const [large, mid] =
    currency === "JPY" ? [1_000_000_000_000, 100_000_000_000] : [10_000_000_000, 2_000_000_000];
  if (marketCap >= large) return "大型株";
  if (marketCap >= mid) return "中型株";
  return "小型株";
}

export function analyzeStock(m: StockMetrics): StockInsight {
  const characteristics: string[] = [];
  const strengths: string[] = [];
  const concerns: string[] = [];
  // 銀行・保険などの金融セクターは業態上、自己資本比率が構造的に低いのが普通のため
  // (isFinancialSectorのコメント参照)、自己資本比率に基づく良い点/懸念点の判定から除外する。
  const isFinancial = isFinancialSector(m.sector);

  // --- 特徴(事実ベース、良し悪しの評価はしない) ---
  const tier = marketCapTier(m.marketCap, m.currency);
  if (tier) characteristics.push(tier);
  if (m.sector) characteristics.push(m.sector);
  if (m.industry && m.industry !== m.sector) characteristics.push(m.industry);
  if (m.dividendYield != null) {
    characteristics.push(
      m.dividendYield >= 4
        ? `高配当(配当利回り${m.dividendYield.toFixed(1)}%)`
        : m.dividendYield > 0
        ? `配当利回り${m.dividendYield.toFixed(1)}%`
        : ""
    );
  }

  // --- 良い点 ---
  if (m.roe != null && m.roe >= 15) strengths.push(`ROE${m.roe.toFixed(1)}%と資本効率が高い`);
  if (!isFinancial && m.equityRatio != null && m.equityRatio >= 60)
    strengths.push(`自己資本比率${m.equityRatio.toFixed(0)}%と財務基盤が強い`);
  if (m.operatingMargin != null && m.operatingMargin >= 20)
    strengths.push(`営業利益率${m.operatingMargin.toFixed(1)}%と収益力が高い`);
  if (m.dividendGrowthYears != null && m.dividendGrowthYears >= 10)
    strengths.push(`${m.dividendGrowthYears}年以上の連続増配実績`);
  if (m.revenueGrowth != null && m.revenueGrowth >= 10)
    strengths.push(`売上成長率${m.revenueGrowth.toFixed(1)}%と成長中`);
  if (m.earningsGrowth != null && m.earningsGrowth >= 10)
    strengths.push(`増益基調(利益成長率${m.earningsGrowth.toFixed(1)}%)`);
  if (m.debtToEquity != null && m.debtToEquity < 50)
    strengths.push("有利子負債が少なく財務が健全");
  if (m.currentRatio != null && m.currentRatio >= 1.5)
    strengths.push(`流動比率${m.currentRatio.toFixed(1)}倍で資金繰りに余裕`);
  if (m.priceVs200ma != null && m.priceVs200ma >= 5)
    strengths.push(`200日線を${m.priceVs200ma.toFixed(1)}%上回る上昇トレンド`);

  // --- 懸念点 ---
  if (m.per != null && m.per > 30) concerns.push(`PER${m.per.toFixed(1)}倍とバリュエーションが割高な可能性`);
  if (m.pbr != null && m.pbr > 5) concerns.push(`PBR${m.pbr.toFixed(1)}倍と資産に対して株価が高め`);
  if (m.debtToEquity != null && m.debtToEquity > 150)
    concerns.push(`負債比率${m.debtToEquity.toFixed(0)}%と財務レバレッジが高め`);
  if (m.currentRatio != null && m.currentRatio < 1.0)
    concerns.push(`流動比率${m.currentRatio.toFixed(1)}倍で短期の資金繰りに注意`);
  if (m.revenueGrowth != null && m.revenueGrowth < 0)
    concerns.push(`売上が前年比${m.revenueGrowth.toFixed(1)}%と減少`);
  if (m.earningsGrowth != null && m.earningsGrowth < 0)
    concerns.push(`利益が前年比${m.earningsGrowth.toFixed(1)}%と減少`);
  if (m.payoutRatio != null && m.payoutRatio > 80)
    concerns.push(`配当性向${m.payoutRatio.toFixed(0)}%と高く、減配リスクに注意`);
  if (m.beta != null && m.beta > 1.5)
    concerns.push(`ベータ値${m.beta.toFixed(2)}と株価変動が大きい傾向`);
  if (!isFinancial && m.equityRatio != null && m.equityRatio < 20)
    concerns.push(`自己資本比率${m.equityRatio.toFixed(0)}%と低く財務体質に注意`);
  if (m.dividendGrowthYears === 0) concerns.push("増配実績が短い、または減配歴がある");
  if (m.priceVs200ma != null && m.priceVs200ma <= -10)
    concerns.push(`200日線を${Math.abs(m.priceVs200ma).toFixed(1)}%下回る下落トレンド`);

  return {
    characteristics: characteristics.filter(Boolean),
    strengths: strengths.slice(0, 4),
    concerns: concerns.slice(0, 4),
  };
}
