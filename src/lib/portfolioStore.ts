"use client";

// 保有銘柄・手元資金。Upstash Redisが設定されていればブラウザ/端末をまたいで同期し、
// 未設定時は従来通りこのブラウザのlocalStorageにのみ保存する(localStore.ts参照)。

import { loadSynced, saveSynced } from "./localStore";
import { brokerCommissionJpy } from "./brokerFees";

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
  const value = await loadSynced<Holding[]>(STORAGE_KEY, "portfolio", []);
  return Array.isArray(value) ? value : [];
}

export async function savePortfolio(holdings: Holding[]): Promise<void> {
  await saveSynced(STORAGE_KEY, "portfolio", holdings);
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
  const n = await loadSynced<number>(CASH_STORAGE_KEY, "portfolio-cash", 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function saveCashJpy(amountJpy: number): Promise<void> {
  await saveSynced(CASH_STORAGE_KEY, "portfolio-cash", Math.max(0, Math.round(amountJpy)));
}

// 銘柄購入(保有銘柄への追加+手数料込みの手元資金の差し引き)を1箇所にまとめた処理。
// ポートフォリオタブの購入フォームと、個別銘柄詳細ページの「ポートフォリオに追加」フォームの
// 両方から呼ぶため、手数料計算や資金不足チェックの実装がずれないようにする。
export interface BuyHoldingInput {
  holdings: Holding[];
  cashJpy: number;
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
  currency: string;
  usdJpyRate: number;
}

export type BuyHoldingResult = { ok: true; holdings: Holding[]; cashJpy: number } | { ok: false; error: string };

export function buyHolding(input: BuyHoldingInput): BuyHoldingResult {
  const { holdings, cashJpy, ticker, name, shares, avgCost, currency, usdJpyRate } = input;
  if (!Number.isFinite(shares) || shares <= 0) return { ok: false, error: "株数を正しく入力してください" };
  if (!Number.isFinite(avgCost) || avgCost <= 0) return { ok: false, error: "平均取得単価を正しく入力してください" };

  const tradeValueNative = shares * avgCost;
  const feeJpy = brokerCommissionJpy(tradeValueNative, currency, usdJpyRate);
  const tradeValueJpy = currency === "JPY" ? tradeValueNative : tradeValueNative * usdJpyRate;
  const costJpy = tradeValueJpy + feeJpy;
  if (costJpy > cashJpy) {
    return {
      ok: false,
      error: `手元資金が不足しています(必要 ¥${Math.round(costJpy).toLocaleString("ja-JP")} / 保有 ¥${Math.round(cashJpy).toLocaleString("ja-JP")})`,
    };
  }

  const nextHoldings = addHolding(holdings, { ticker, name, shares, avgCost, currency });
  return { ok: true, holdings: nextHoldings, cashJpy: cashJpy - costJpy };
}
