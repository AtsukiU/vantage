// ポートフォリオアドバイザー: 銘柄の売買判断ではなく、資産配分の健全性(現金比率・
// セクター/通貨/銘柄の集中度)を毎回チェックする。純粋関数化してPortfolioTab.tsxから使う。

import { sectorLabelJa } from "./sectorLabels";

export type HealthLevel = "good" | "watch" | "warning";

export interface HealthItem {
  level: HealthLevel;
  message: string;
}

export interface PortfolioHealth {
  overallLevel: HealthLevel;
  cashRatioPct: number;
  items: HealthItem[];
}

const LEVEL_RANK: Record<HealthLevel, number> = { good: 0, watch: 1, warning: 2 };

export function computePortfolioHealth(
  holdingsValueJpy: number,
  cashJpy: number,
  sectorBreakdown: { sector: string; pct: number }[],
  currencyBreakdown: { currency: string; pct: number }[],
  positionBreakdown: { name: string; pct: number }[]
): PortfolioHealth | null {
  const totalAssetsJpy = holdingsValueJpy + cashJpy;
  if (totalAssetsJpy <= 0) return null;
  const cashRatioPct = (cashJpy / totalAssetsJpy) * 100;

  const items: HealthItem[] = [];

  // 現金比率
  if (holdingsValueJpy <= 0) {
    items.push({ level: "watch", message: "保有銘柄がまだ登録されていません。" });
  } else if (cashRatioPct < 5) {
    items.push({ level: "warning", message: `現金比率${cashRatioPct.toFixed(0)}%と低め。新規の買いや急な下落への備えが薄い状態です。` });
  } else if (cashRatioPct > 50) {
    items.push({ level: "watch", message: `現金比率${cashRatioPct.toFixed(0)}%と高め。投資機会を逃している可能性があります。` });
  } else {
    items.push({ level: "good", message: `現金比率${cashRatioPct.toFixed(0)}%で無理のない範囲です。` });
  }

  // セクター集中度
  const topSector = sectorBreakdown[0];
  if (topSector && topSector.pct >= 40) {
    items.push({ level: "warning", message: `「${sectorLabelJa(topSector.sector)}」セクターが評価額の${topSector.pct.toFixed(0)}%を占め、集中しすぎています。` });
  } else if (topSector && topSector.pct >= 30) {
    items.push({ level: "watch", message: `「${sectorLabelJa(topSector.sector)}」セクターが評価額の${topSector.pct.toFixed(0)}%とやや偏っています。` });
  }

  // 通貨集中度
  const topCurrency = currencyBreakdown[0];
  if (topCurrency && currencyBreakdown.length > 1 && topCurrency.pct >= 90) {
    items.push({ level: "watch", message: `資産の${topCurrency.pct.toFixed(0)}%が${topCurrency.currency}建てに偏っています。` });
  }

  // 単一銘柄集中度
  const topPosition = positionBreakdown[0];
  if (topPosition && topPosition.pct >= 30) {
    items.push({ level: "warning", message: `「${topPosition.name}」1銘柄で評価額の${topPosition.pct.toFixed(0)}%を占め、集中リスクが高い状態です。` });
  } else if (topPosition && topPosition.pct >= 20) {
    items.push({ level: "watch", message: `「${topPosition.name}」1銘柄が評価額の${topPosition.pct.toFixed(0)}%とやや大きめです。` });
  }

  if (items.length === 0 || items.every((i) => i.level === "good")) {
    items.push({ level: "good", message: "セクター・通貨・銘柄の集中度は目立った偏りがありません。" });
  }

  const overallLevel = items.reduce<HealthLevel>((acc, i) => (LEVEL_RANK[i.level] > LEVEL_RANK[acc] ? i.level : acc), "good");

  return { overallLevel, cashRatioPct, items };
}
