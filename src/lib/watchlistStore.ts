"use client";

// ウォッチリスト: 保有していないが気になる銘柄を並べて一覧できるだけの、保有株数・取得単価を
// 持たない軽量なリスト(ポートフォリオとは別物)。このブラウザのlocalStorageにのみ保存する。

import { loadLocal, saveLocal } from "./localStore";

export interface WatchlistItem {
  ticker: string;
  name: string;
  addedAt: string; // ISO
}

const STORAGE_KEY = "stock-watchlist-v1";

export async function loadWatchlist(): Promise<WatchlistItem[]> {
  const value = await loadLocal<WatchlistItem[]>(STORAGE_KEY, []);
  return Array.isArray(value) ? value : [];
}

export async function saveWatchlist(items: WatchlistItem[]): Promise<void> {
  await saveLocal(STORAGE_KEY, items);
}

export function addToWatchlist(items: WatchlistItem[], ticker: string, name: string): WatchlistItem[] {
  if (items.some((i) => i.ticker === ticker)) return items;
  return [...items, { ticker, name, addedAt: new Date().toISOString() }];
}

export function removeFromWatchlist(items: WatchlistItem[], ticker: string): WatchlistItem[] {
  return items.filter((i) => i.ticker !== ticker);
}
