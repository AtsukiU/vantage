"use client";

// ウォッチリスト: 保有していないが気になる銘柄を並べて一覧できるだけの、保有株数・取得単価を
// 持たない軽量なリスト(ポートフォリオとは別物)。Upstash Redis設定時はブラウザ/端末間で同期する。

import { loadSynced, saveSynced } from "./localStore";

export interface WatchlistItem {
  ticker: string;
  name: string;
  addedAt: string; // ISO
}

const STORAGE_KEY = "stock-watchlist-v1";

// 初回(このブラウザでまだ一度も保存されていない)は、主要指数・金・債券をデフォルトで
// 入れておく。ユーザーが一度でも追加/削除して保存すると、以降はそちらが優先される
// (loadLocalはキーが未保存の時だけこのデフォルトを返す)。
const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { ticker: "^N225", name: "日経平均株価", addedAt: "2026-01-01T00:00:00.000Z" },
  { ticker: "^GSPC", name: "S&P500", addedAt: "2026-01-01T00:00:00.000Z" },
  { ticker: "^IXIC", name: "NASDAQ総合指数", addedAt: "2026-01-01T00:00:00.000Z" },
  { ticker: "GLD", name: "SPDRゴールド・シェア(金)", addedAt: "2026-01-01T00:00:00.000Z" },
  { ticker: "TLT", name: "iシェアーズ 米国国債20年超 ETF(債券)", addedAt: "2026-01-01T00:00:00.000Z" },
];

export async function loadWatchlist(): Promise<WatchlistItem[]> {
  const value = await loadSynced<WatchlistItem[]>(STORAGE_KEY, "watchlist", DEFAULT_WATCHLIST);
  return Array.isArray(value) ? value : [];
}

export async function saveWatchlist(items: WatchlistItem[]): Promise<void> {
  await saveSynced(STORAGE_KEY, "watchlist", items);
}

export function addToWatchlist(items: WatchlistItem[], ticker: string, name: string): WatchlistItem[] {
  if (items.some((i) => i.ticker === ticker)) return items;
  return [...items, { ticker, name, addedAt: new Date().toISOString() }];
}

export function removeFromWatchlist(items: WatchlistItem[], ticker: string): WatchlistItem[] {
  return items.filter((i) => i.ticker !== ticker);
}
