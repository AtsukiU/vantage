"use client";

// ポートフォリオの評価額推移(円換算)を日次で記録する。このブラウザのlocalStorageにのみ保存する。
// アプリを開くたびに「今日の評価額」を上書き保存していく方式。

import { loadLocal, saveLocal } from "./localStore";

export interface PortfolioSnapshot {
  date: string; // YYYY-MM-DD
  valueJpy: number; // 保有株式の評価額(円換算)
  cashJpy: number; // 手元資金(円換算)。cashJpyを記録する前の古いスナップショットには無いのでload時に0で補う
}

const KEY = "stockapp.portfolioHistory.v1";
const MAX_ENTRIES = 365;

async function readAll(): Promise<PortfolioSnapshot[]> {
  const value = await loadLocal<PortfolioSnapshot[]>(KEY, []);
  if (!Array.isArray(value)) return [];
  return value.map((s) => ({ ...s, cashJpy: s.cashJpy ?? 0 }));
}

async function writeAll(list: PortfolioSnapshot[]): Promise<void> {
  await saveLocal(KEY, list);
}

export async function getHistory(): Promise<PortfolioSnapshot[]> {
  return (await readAll()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function recordSnapshot(valueJpy: number, cashJpy: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const all = await readAll();
  const existing = all.find((s) => s.date === today);
  if (existing) {
    existing.valueJpy = valueJpy;
    existing.cashJpy = cashJpy;
  } else {
    all.push({ date: today, valueJpy, cashJpy });
  }
  all.sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = all.length > MAX_ENTRIES ? all.slice(all.length - MAX_ENTRIES) : all;
  await writeAll(trimmed);
}
