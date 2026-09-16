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
  buyReasons?: string[]; // 運用アドバイザーの推奨から買った場合の根拠(投資家名など、複数買い増した分は重複なく蓄積)
}

const STORAGE_KEY = "stock-portfolio-v1";

function mergeBuyReasons(a?: string[], b?: string[]): string[] | undefined {
  const merged = Array.from(new Set([...(a ?? []), ...(b ?? [])]));
  return merged.length > 0 ? merged : undefined;
}

// 同一銘柄(ティッカー)の保有行を1本に統合する。株数は合算し、取得単価は株数加重平均で
// 再計算する(例: 10株@1000円 + 10株@1200円 → 20株@1100円)。idとaddedAtは最初に
// 買った行のものを引き継ぐ(以後の「売却」ボタンが指す対象が変わらないようにするため)。
// buyReasonsは重複なく合算する(別々の根拠で買い増していた場合、両方バッジに残す)。
export function mergeHoldings(holdings: Holding[]): Holding[] {
  const byTicker = new Map<string, Holding>();
  for (const h of holdings) {
    const existing = byTicker.get(h.ticker);
    if (!existing) {
      byTicker.set(h.ticker, { ...h });
      continue;
    }
    const totalShares = existing.shares + h.shares;
    const weightedCost = totalShares > 0 ? (existing.avgCost * existing.shares + h.avgCost * h.shares) / totalShares : existing.avgCost;
    const earlier = existing.addedAt <= h.addedAt ? existing : h;
    byTicker.set(h.ticker, {
      ...existing,
      shares: totalShares,
      avgCost: weightedCost,
      addedAt: earlier.addedAt,
      buyReasons: mergeBuyReasons(existing.buyReasons, h.buyReasons),
    });
  }
  return Array.from(byTicker.values());
}

export async function loadPortfolio(): Promise<Holding[]> {
  const value = await loadSynced<Holding[]>(STORAGE_KEY, "portfolio", []);
  const holdings = Array.isArray(value) ? value : [];
  const merged = mergeHoldings(holdings);
  if (merged.length !== holdings.length) {
    // 過去に同じ銘柄を複数回買って行が分かれていた分を、読み込み時に統合して保存し直す。
    await savePortfolio(merged);
  }
  return merged;
}

export async function savePortfolio(holdings: Holding[]): Promise<void> {
  await saveSynced(STORAGE_KEY, "portfolio", holdings);
}

export function addHolding(
  holdings: Holding[],
  input: Omit<Holding, "id" | "addedAt">
): Holding[] {
  const existing = holdings.find((h) => h.ticker === input.ticker);
  if (existing) {
    const totalShares = existing.shares + input.shares;
    const weightedCost = totalShares > 0 ? (existing.avgCost * existing.shares + input.avgCost * input.shares) / totalShares : existing.avgCost;
    return holdings.map((h) =>
      h.id === existing.id
        ? { ...h, shares: totalShares, avgCost: weightedCost, buyReasons: mergeBuyReasons(existing.buyReasons, input.buyReasons) }
        : h
    );
  }
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
  buyReason?: string; // 運用アドバイザーの推奨から買った場合の根拠(投資家名など)
}

export type BuyHoldingResult = { ok: true; holdings: Holding[]; cashJpy: number } | { ok: false; error: string };

export function buyHolding(input: BuyHoldingInput): BuyHoldingResult {
  const { holdings, cashJpy, ticker, name, shares, avgCost, currency, usdJpyRate, buyReason } = input;
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

  const nextHoldings = addHolding(holdings, { ticker, name, shares, avgCost, currency, buyReasons: buyReason ? [buyReason] : undefined });
  return { ok: true, holdings: nextHoldings, cashJpy: cashJpy - costJpy };
}
