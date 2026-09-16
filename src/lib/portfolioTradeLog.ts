"use client";

// 実ポートフォリオの売買イベント(いつ・何を・いくらで買った/売ったか)を記録する履歴ログ。
// portfolioStore.tsのHolding[]は「今の保有状況」だけを持つ集約データ(同一銘柄は統合済み)なので、
// 資産推移グラフに売買タイミングをマーカーとして重ねるには、この別ログが必要になる。
// Upstash設定時はportfolio-history等と同じくブラウザ/端末間で同期する。

import { loadSynced, saveSynced } from "./localStore";

export interface PortfolioTradeEvent {
  id: string;
  date: string; // ISO
  ticker: string;
  name: string;
  side: "buy" | "sell";
  shares: number;
  price: number; // 1株あたり、現地通貨
  currency: string;
  valueJpy: number; // 約定代金(円換算、手数料抜き)
  plJpy: number | null; // 売却時のみ: 実現損益(円換算、手数料込み)。買いはnull
}

const KEY = "stockapp.portfolioTrades.v1";
const MAX_ENTRIES = 500;

export async function loadTradeLog(): Promise<PortfolioTradeEvent[]> {
  const value = await loadSynced<PortfolioTradeEvent[]>(KEY, "portfolio-trades", []);
  const list = Array.isArray(value) ? value : [];
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

export async function recordTrade(event: Omit<PortfolioTradeEvent, "id">): Promise<PortfolioTradeEvent> {
  const list = await loadTradeLog();
  const entry: PortfolioTradeEvent = { ...event, id: `${event.ticker}-${event.side}-${Date.now()}` };
  const next = [...list, entry].slice(-MAX_ENTRIES);
  await saveSynced(KEY, "portfolio-trades", next);
  return entry;
}

// このログを追加する前から保有していた銘柄には買いイベントが記録されていないため、
// 資産推移グラフにマーカーが出ない。現在の保有情報(Holding、平均取得単価・株数・追加日)から
// 「買い」イベントを1件だけ遡って補完する(1回だけの一括購入として近似する。複数回に分けて
// 買っていた場合の正確な購入履歴までは復元できないが、平均取得単価・合計株数・最初に
// 買った日付は正しいので、実用上十分な近似になる)。同じ銘柄に既に買いイベントがあれば
// 二重には補完しない。
export async function backfillFromHoldings(
  holdings: { ticker: string; name: string; shares: number; avgCost: number; currency: string; addedAt: string }[],
  usdJpyRate: number
): Promise<PortfolioTradeEvent[]> {
  const existing = await loadTradeLog();
  const hasBuy = new Set(existing.filter((t) => t.side === "buy").map((t) => t.ticker));
  const missing = holdings.filter((h) => !hasBuy.has(h.ticker));
  if (missing.length === 0) return existing;

  const backfilled: PortfolioTradeEvent[] = missing.map((h) => ({
    id: `${h.ticker}-buy-backfill-${h.addedAt}`,
    date: h.addedAt,
    ticker: h.ticker,
    name: h.name,
    side: "buy",
    shares: h.shares,
    price: h.avgCost,
    currency: h.currency,
    valueJpy: Math.round(h.currency === "JPY" ? h.avgCost * h.shares : h.avgCost * h.shares * usdJpyRate),
    plJpy: null,
  }));

  const next = [...existing, ...backfilled].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_ENTRIES);
  await saveSynced(KEY, "portfolio-trades", next);
  return next;
}
