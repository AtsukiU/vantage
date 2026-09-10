"use client";

// 投資シミュレーター(紙上取引)の状態管理。実際のお金は動かさず、実際の株価を使って
// 仮想の現金・持ち株を売買する練習用。このブラウザのlocalStorageにのみ保存する。
// 通貨はJPY/USDそれぞれ別の仮想現金残高を持つ(為替換算はしない簡易モデル)。

import { loadLocal, saveLocal } from "./localStore";
import { brokerCommissionNative } from "./brokerFees";

export interface SimTrade {
  id: string;
  ticker: string;
  name: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  currency: string;
  at: string; // ISO
  feeNative: number; // SBI証券想定の売買手数料(取引と同じ通貨、国内株は0)
}

export interface SimPosition {
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
  currency: string;
  stopLoss: number | null; // 現在の損切りライン(現地通貨)。含み益が乗ると自動で切り上がる
  highWaterMark: number | null; // エントリー後の最高値(トレーリング判定用)
  trailing: boolean; // トレーリングモードが有効か(含み益が一定を超えると自動でON)
}

// トレーリング開始の閾値(平均取得単価からの含み益%)。バックテストで検証した
// 「初期リスク1R(-8%の損切り幅)分の含み益が出たら追いかけ始める」という考え方に合わせている。
const TRAIL_ACTIVATE_GAIN_PCT = 8;

export interface SimState {
  cash: Record<string, number>;
  positions: SimPosition[];
  trades: SimTrade[];
  startedAt: string;
}

const STORAGE_KEY = "stock-simulator-v1";
export const STARTING_CASH: Record<string, number> = { JPY: 1_000_000, USD: 10_000 };

function defaultState(): SimState {
  return {
    cash: { ...STARTING_CASH },
    positions: [],
    trades: [],
    startedAt: new Date().toISOString(),
  };
}

export async function loadSimState(): Promise<SimState> {
  const parsed = await loadLocal<SimState | null>(STORAGE_KEY, null);
  if (!parsed || typeof parsed !== "object") return defaultState();
  return { ...defaultState(), ...parsed };
}

export async function saveSimState(state: SimState): Promise<void> {
  await saveLocal(STORAGE_KEY, state);
}

export async function resetSimState(): Promise<SimState> {
  const state = defaultState();
  await saveSimState(state);
  return state;
}

interface OrderParams {
  ticker: string;
  name: string;
  shares: number;
  price: number;
  currency: string;
  stopLossPct?: number | null; // 新規ポジションの初期損切り%(例: -8)。省略時は損切りラインなし
}

export function buy(state: SimState, params: OrderParams): SimState {
  if (params.shares <= 0) throw new Error("株数は1株以上で入力してください");
  const feeNative = brokerCommissionNative(params.shares * params.price, params.currency);
  const cost = params.shares * params.price + feeNative;
  const available = state.cash[params.currency] ?? 0;
  if (cost > available) {
    throw new Error(
      `資金が不足しています(手数料込みで必要 ${cost.toLocaleString()} ${params.currency} / 保有 ${available.toLocaleString()} ${params.currency})`
    );
  }

  const positions = [...state.positions];
  const idx = positions.findIndex((p) => p.ticker === params.ticker);
  if (idx >= 0) {
    // 既存ポジションへの買い増しは平均取得単価だけ更新し、損切りライン・トレーリング状態はそのまま維持する
    const existing = positions[idx];
    const totalShares = existing.shares + params.shares;
    const totalCost = existing.avgCost * existing.shares + cost;
    positions[idx] = { ...existing, shares: totalShares, avgCost: totalCost / totalShares };
  } else {
    const stopLoss =
      params.stopLossPct != null ? Math.round(params.price * (1 + params.stopLossPct / 100) * 100) / 100 : null;
    positions.push({
      ticker: params.ticker,
      name: params.name,
      shares: params.shares,
      avgCost: params.price,
      currency: params.currency,
      stopLoss,
      highWaterMark: params.price,
      trailing: false,
    });
  }

  const trade: SimTrade = {
    id: `${params.ticker}-${Date.now()}`,
    ticker: params.ticker,
    name: params.name,
    side: "buy",
    shares: params.shares,
    price: params.price,
    currency: params.currency,
    at: new Date().toISOString(),
    feeNative,
  };

  return {
    ...state,
    cash: { ...state.cash, [params.currency]: available - cost },
    positions,
    trades: [trade, ...state.trades],
  };
}

export function sell(state: SimState, params: OrderParams): SimState {
  if (params.shares <= 0) throw new Error("株数は1株以上で入力してください");
  const positions = [...state.positions];
  const idx = positions.findIndex((p) => p.ticker === params.ticker);
  const existing = idx >= 0 ? positions[idx] : null;
  if (!existing || existing.shares < params.shares) {
    throw new Error(
      `保有株数が不足しています(保有 ${existing?.shares ?? 0}株 / 売却指定 ${params.shares}株)`
    );
  }

  const feeNative = brokerCommissionNative(params.shares * params.price, params.currency);
  const proceeds = params.shares * params.price - feeNative;
  const remainingShares = existing.shares - params.shares;
  if (remainingShares === 0) {
    positions.splice(idx, 1);
  } else {
    positions[idx] = { ...existing, shares: remainingShares };
  }

  const trade: SimTrade = {
    id: `${params.ticker}-${Date.now()}`,
    ticker: params.ticker,
    name: params.name,
    side: "sell",
    shares: params.shares,
    price: params.price,
    currency: params.currency,
    at: new Date().toISOString(),
    feeNative,
  };

  return {
    ...state,
    cash: { ...state.cash, [params.currency]: (state.cash[params.currency] ?? 0) + proceeds },
    positions,
    trades: [trade, ...state.trades],
  };
}

// 保有ポジションの高値・トレーリングストップを、現在値とMA50乖離率(priceVs50ma)を使って
// 更新する。損切りラインは切り上がる一方で、下がることはない。含み益が
// TRAIL_ACTIVATE_GAIN_PCT%を超えたらトレーリング開始、以降は50日線を目安にラインを追いかける。
// ページを開いて最新の株価が取れるたびに呼び出す想定(常時監視ではなく、開いた時点の判定)。
export function updateTrailingStops(
  state: SimState,
  priceByTicker: Map<string, { price: number | null; priceVs50ma?: number | null }>
): SimState {
  let changed = false;
  const positions = state.positions.map((p) => {
    const info = priceByTicker.get(p.ticker);
    if (!info || info.price == null) return p;

    let highWaterMark = p.highWaterMark ?? p.avgCost;
    let trailing = p.trailing;
    let stopLoss = p.stopLoss;

    if (info.price > highWaterMark) highWaterMark = info.price;
    const gainPct = p.avgCost > 0 ? ((highWaterMark - p.avgCost) / p.avgCost) * 100 : 0;
    if (!trailing && gainPct >= TRAIL_ACTIVATE_GAIN_PCT) trailing = true;

    if (trailing && info.priceVs50ma != null) {
      const ma50Price = info.price / (1 + info.priceVs50ma / 100);
      if (Number.isFinite(ma50Price) && ma50Price > 0 && (stopLoss == null || ma50Price > stopLoss)) {
        stopLoss = Math.round(ma50Price * 100) / 100;
      }
    }

    if (highWaterMark === p.highWaterMark && trailing === p.trailing && stopLoss === p.stopLoss) return p;
    changed = true;
    return { ...p, highWaterMark, trailing, stopLoss };
  });

  if (!changed) return state;
  return { ...state, positions };
}

// 損切りラインの手動上書き(ユーザーが自分の判断で調整したい場合)。
export function setStopLoss(state: SimState, ticker: string, stopLoss: number | null): SimState {
  return {
    ...state,
    positions: state.positions.map((p) => (p.ticker === ticker ? { ...p, stopLoss } : p)),
  };
}

// トレーリングモードの手動ON/OFF切り替え。
export function setTrailingEnabled(state: SimState, ticker: string, trailing: boolean): SimState {
  return {
    ...state,
    positions: state.positions.map((p) => (p.ticker === ticker ? { ...p, trailing } : p)),
  };
}
