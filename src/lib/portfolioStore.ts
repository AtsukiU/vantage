"use client";

// 保有銘柄。このブラウザのlocalStorageにのみ保存する。

import { loadLocal, saveLocal } from "./localStore";

export interface Holding {
  id: string;
  ticker: string;
  name: string;
  shares: number;
  avgCost: number; // 1株あたりの平均取得単価(銘柄の現地通貨)
  currency: string;
  addedAt: string; // ISO
}

const STORAGE_KEY = "stock-portfolio-v1";

export async function loadPortfolio(): Promise<Holding[]> {
  const value = await loadLocal<Holding[]>(STORAGE_KEY, []);
  return Array.isArray(value) ? value : [];
}

export async function savePortfolio(holdings: Holding[]): Promise<void> {
  await saveLocal(STORAGE_KEY, holdings);
}

export function addHolding(
  holdings: Holding[],
  input: Omit<Holding, "id" | "addedAt">
): Holding[] {
  const holding: Holding = {
    ...input,
    id: `${input.ticker}-${Date.now()}`,
    addedAt: new Date().toISOString(),
  };
  return [...holdings, holding];
}

export function removeHolding(holdings: Holding[], id: string): Holding[] {
  return holdings.filter((h) => h.id !== id);
}

// 手元資金(現金・投資に回せる余裕資産)。円換算した単一の数値で管理する簡易モデル
// (運用アドバイザーの「今買える銘柄」判定や、ポートフォリオアドバイザーの現金比率チェックに使う)。
const CASH_STORAGE_KEY = "stock-portfolio-cash-v1";

export async function loadCashJpy(): Promise<number> {
  const n = await loadLocal<number>(CASH_STORAGE_KEY, 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function saveCashJpy(amountJpy: number): Promise<void> {
  await saveLocal(CASH_STORAGE_KEY, Math.max(0, Math.round(amountJpy)));
}
