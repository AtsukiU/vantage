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
