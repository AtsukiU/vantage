import type { StockSignals } from "./stockSignals";
import { buildScoreResult, type ScoreResult } from "./checklistTypes";

// 投資委員会の「センチメント/フロー役」による簡易チェックリスト(5項目)。
// 「他の投資家が実際にどう動いているか」(機関投資家・インサイダー・アナリスト・決算)を判定する。
// recommendationKeyはStockMetrics側のフィールドのため、呼び出し元から渡してもらう。

export function computeSentimentRoleScore(s: StockSignals, recommendationKey: string | null): ScoreResult {
  const netInsiderShares =
    s.netInsiderBuyShares != null && s.netInsiderSellShares != null
      ? s.netInsiderBuyShares - s.netInsiderSellShares
      : null;
  const latestSurprise = s.earningsSurprises[s.earningsSurprises.length - 1] ?? null;
  const isBuyRated = recommendationKey === "strong_buy" || recommendationKey === "buy";

  return buildScoreResult([
    {
      key: "institutional_buying",
      label: "機関投資家が純増",
      pass: s.netInstitutionalBuyingPercent != null && s.netInstitutionalBuyingPercent > 0,
      detail:
        s.netInstitutionalBuyingPercent != null
          ? `6ヶ月純増減 ${s.netInstitutionalBuyingPercent >= 0 ? "+" : ""}${s.netInstitutionalBuyingPercent.toFixed(1)}%`
          : "データ不足",
    },
    {
      key: "insider_buying",
      label: "インサイダーが純買い越し",
      pass: netInsiderShares != null && netInsiderShares > 0,
      detail: netInsiderShares != null ? `純${netInsiderShares >= 0 ? "買い越し" : "売り越し"}` : "開示データなし",
    },
    {
      key: "earnings_beat",
      label: "直近決算が市場予想を上回った",
      pass: latestSurprise?.surprisePercent != null && latestSurprise.surprisePercent > 0,
      detail:
        latestSurprise?.surprisePercent != null
          ? `サプライズ ${latestSurprise.surprisePercent >= 0 ? "+" : ""}${latestSurprise.surprisePercent.toFixed(1)}%`
          : "データ不足",
    },
    {
      key: "analyst_momentum",
      label: "アナリスト格上げが格下げを上回る(直近90日)",
      pass: s.upgrades90d > s.downgrades90d,
      detail: `↑${s.upgrades90d} / ↓${s.downgrades90d}`,
    },
    {
      key: "recommendation",
      label: "アナリストの推奨が買い系",
      pass: isBuyRated,
      detail: recommendationKey ?? "データ不足",
    },
  ]);
}
