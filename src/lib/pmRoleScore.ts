import type { Holding } from "./portfolioStore";
import { buildScoreResult, type ScoreResult } from "./checklistTypes";

// 投資委員会の「ポートフォリオマネージャー役」による簡易チェックリスト(3項目)。
// 他の役と違い、銘柄そのものの良し悪しではなく「今の保有ポートフォリオに追加して
// バランスが崩れないか」を見る。ブラウザのlocalStorageに保存された保有銘柄が必要なため、
// サーバー側(スクリーニング等)では計算できず、詳細ページでのみクライアント側で計算する。

export interface HoldingSnapshot {
  ticker: string;
  valueJpy: number; // 円換算した現在の評価額
  sector: string | null;
  currency: string;
}

export function computePmRoleScore(
  holdings: HoldingSnapshot[],
  candidateTicker: string,
  candidateSector: string | null,
  candidateCurrency: string | null
): ScoreResult {
  if (holdings.length === 0) {
    return buildScoreResult([
      { key: "sector_concentration", label: "セクター集中リスクが低い(30%未満)", pass: true, detail: "保有銘柄なし" },
      { key: "currency_concentration", label: "通貨集中リスクが低い(70%未満)", pass: true, detail: "保有銘柄なし" },
      { key: "position_concentration", label: "この銘柄をまだ過大保有していない(20%未満)", pass: true, detail: "保有銘柄なし" },
    ]);
  }

  const totalValueJpy = holdings.reduce((sum, h) => sum + h.valueJpy, 0);
  const sectorValueJpy = holdings
    .filter((h) => candidateSector != null && h.sector === candidateSector)
    .reduce((sum, h) => sum + h.valueJpy, 0);
  const currencyValueJpy = holdings
    .filter((h) => candidateCurrency != null && h.currency === candidateCurrency)
    .reduce((sum, h) => sum + h.valueJpy, 0);
  const ownTickerValueJpy = holdings
    .filter((h) => h.ticker === candidateTicker)
    .reduce((sum, h) => sum + h.valueJpy, 0);

  const sectorPct = totalValueJpy > 0 ? (sectorValueJpy / totalValueJpy) * 100 : 0;
  const currencyPct = totalValueJpy > 0 ? (currencyValueJpy / totalValueJpy) * 100 : 0;
  const ownTickerPct = totalValueJpy > 0 ? (ownTickerValueJpy / totalValueJpy) * 100 : 0;

  return buildScoreResult([
    {
      key: "sector_concentration",
      label: "セクター集中リスクが低い(30%未満)",
      pass: candidateSector == null || sectorPct < 30,
      detail: candidateSector != null ? `${candidateSector} ${sectorPct.toFixed(0)}%` : "セクター不明",
    },
    {
      key: "currency_concentration",
      label: "通貨集中リスクが低い(70%未満)",
      pass: candidateCurrency == null || currencyPct < 70,
      detail: candidateCurrency != null ? `${candidateCurrency} ${currencyPct.toFixed(0)}%` : "通貨不明",
    },
    {
      key: "position_concentration",
      label: "この銘柄をまだ過大保有していない(20%未満)",
      pass: ownTickerPct < 20,
      detail: `現在の保有比率 ${ownTickerPct.toFixed(0)}%`,
    },
  ]);
}

// PortfolioTab.tsxと同じ考え方(現在値×株数を円換算)でHoldingSnapshotを組み立てるヘルパー。
export function buildHoldingSnapshots(
  holdings: Holding[],
  priceByTicker: Map<string, { price: number | null; sector: string | null }>,
  usdJpyRate: number
): HoldingSnapshot[] {
  return holdings.map((h) => {
    const meta = priceByTicker.get(h.ticker);
    const price = meta?.price ?? h.avgCost;
    const rawValue = price * h.shares;
    const valueJpy = h.currency === "JPY" ? rawValue : rawValue * usdJpyRate;
    return { ticker: h.ticker, valueJpy, sector: meta?.sector ?? null, currency: h.currency };
  });
}
