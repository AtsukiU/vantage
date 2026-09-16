"use client";

import { useEffect, useState } from "react";
import { GlassPageShell } from "../GlassPageShell";
import { StockSearchBar } from "../stock/StockSearchBar";
import {
  buyHolding,
  loadPortfolio,
  removeHolding,
  savePortfolio,
  loadCashJpy,
  saveCashJpy,
  type Holding,
} from "@/lib/portfolioStore";
import { fetchMetricsBatch } from "@/lib/fetchMetricsBatch";
import type { StockMetrics } from "@/lib/stockMetrics";
import { brokerCommissionJpy } from "@/lib/brokerFees";
import { GLASS_CARD, GLASS_BTN_PRIMARY, GLASS_UP, GLASS_DOWN } from "@/lib/glassStyles";
import { getHistory, recordSnapshot, type PortfolioSnapshot } from "@/lib/portfolioHistoryStore";
import { recordTrade, loadTradeLog, type PortfolioTradeEvent } from "@/lib/portfolioTradeLog";
import { computePortfolioHealth, type HealthLevel } from "@/lib/portfolioHealth";
import { sectorLabelJa, SECTOR_ORDER } from "@/lib/sectorLabels";
import { PortfolioValueChart } from "./PortfolioValueChart";
import { PortfolioTradesChart } from "./PortfolioTradesChart";
import { AllocationDonutChart } from "./AllocationDonutChart";
import { TrailingStopBadge } from "../TrailingStopBadge";
import { ClipboardCheck } from "lucide-react";

// good/warningは白文字を乗せる固定バッジ色なのでダークモードでも変えない
// (watchはもともとテーマのaccent-strongを使っていて、これは元から白文字と両立する濃さなので維持)。
const HEALTH_COLOR: Record<HealthLevel, string> = { good: "#2f9e5c", watch: "var(--accent-strong)", warning: "#c0392b" };
const HEALTH_LABEL: Record<HealthLevel, string> = { good: "良好", watch: "注意", warning: "要改善" };

const ALLOCATION_COLORS = ["var(--accent)", "var(--price-down)", "var(--price-up)", "#a9843b", "var(--text-secondary)", "#8f6ea3", "#3f8f8f", "var(--text-muted)"];
// 通貨・セクターとも、以前は「評価額が大きい順」にALLOCATION_COLORSを割り振っていたため、
// 保有比率の順位が入れ替わるたびに同じ通貨/セクターでも色が変わってしまっていた
// (DashboardTabのsectorColorと同じ問題、同じ考え方で固定する)。
const CURRENCY_ORDER = ["JPY", "USD", "EUR", "GBP", "HKD", "CNY", "AUD", "CAD"];
function fixedColor(key: string, order: string[]): string {
  const idx = order.indexOf(key);
  if (idx === -1) return "var(--text-muted)";
  return ALLOCATION_COLORS[idx % ALLOCATION_COLORS.length];
}

function fmt(n: number, currency: string): string {
  const digits = currency === "JPY" ? 0 : 2;
  return n.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function currencyPrefix(currency: string): string {
  return currency === "JPY" ? "¥" : currency === "USD" ? "$" : "";
}

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function exportPortfolioCsv(holdings: Holding[], prices: Map<string, StockMetrics>) {
  const header = [
    "ティッカー",
    "銘柄名",
    "株数",
    "取得単価",
    "通貨",
    "現在値",
    "評価額",
    "評価損益",
    "評価損益率(%)",
    "追加日",
  ];
  const rows = holdings.map((h) => {
    const m = prices.get(h.ticker);
    const price = m?.price ?? h.avgCost;
    const value = price * h.shares;
    const cost = h.avgCost * h.shares;
    const pl = value - cost;
    const plPct = cost > 0 ? (pl / cost) * 100 : 0;
    return [
      h.ticker,
      h.name,
      h.shares,
      h.avgCost,
      h.currency,
      price,
      value.toFixed(2),
      pl.toFixed(2),
      plPct.toFixed(2),
      h.addedAt.slice(0, 10),
    ];
  });
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `portfolio_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function PortfolioTab({
  hidden,
  onOpenDetail,
}: {
  hidden: boolean;
  onOpenDetail: (symbol: string, name: string) => void;
}) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] = useState<Map<string, StockMetrics>>(new Map());
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [pending, setPending] = useState<{ symbol: string; name: string } | null>(null);
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [usdJpyRate, setUsdJpyRate] = useState<number | null>(null);
  const [history, setHistory] = useState<PortfolioSnapshot[]>([]);
  const [trades, setTrades] = useState<PortfolioTradeEvent[]>([]);
  const [cashJpy, setCashJpy] = useState(0);
  const [cashInput, setCashInput] = useState("");
  const [editingCash, setEditingCash] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [depositInput, setDepositInput] = useState("");

  useEffect(() => {
    // 銘柄詳細ページの「ポートフォリオに追加」など、このタブの外から保有株・手元資金が
    // 変更されることがあるため、タブを開くたびに読み直す(マウント時の一度きりだと、
    // 他画面での変更が反映されないまま古い表示が残ってしまう)。
    if (hidden) return;
    let cancelled = false;
    Promise.all([loadPortfolio(), getHistory(), loadCashJpy(), loadTradeLog()]).then(([h, hist, cash, tradeLog]) => {
      if (cancelled) return;
      setHoldings(h);
      setHistory(hist);
      setCashJpy(cash);
      setTrades(tradeLog);
      setHydrated(true);
    });
    fetchMetricsBatch(["JPY=X"]).then((res) => {
      const rate = res.get("JPY=X")?.price;
      if (rate && !cancelled) setUsdJpyRate(rate);
    });
    return () => {
      cancelled = true;
    };
  }, [hidden]);

  useEffect(() => {
    if (!hydrated || holdings.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 保有銘柄が無いときの価格マップをリセット
      setPrices(new Map());
      return;
    }
    let cancelled = false;
    setLoadingPrices(true);
    fetchMetricsBatch(holdings.map((h) => h.ticker), { concurrency: 6 })
      .then((res) => {
        if (!cancelled) setPrices(res);
      })
      .finally(() => {
        if (!cancelled) setLoadingPrices(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, holdings.map((h) => h.ticker).join(",")]);

  const rate = usdJpyRate ?? 150;
  const toJpy = (amount: number, currency: string) => (currency === "JPY" ? amount : amount * rate);

  function handleAdd() {
    setFormError(null);
    if (!pending) {
      setFormError("銘柄を検索して選択してください");
      return;
    }
    const meta = prices.get(pending.symbol);
    const currency = meta?.currency ?? (pending.symbol.endsWith(".T") ? "JPY" : "USD");

    const result = buyHolding({
      holdings,
      cashJpy,
      ticker: pending.symbol,
      name: pending.name,
      shares: Number(shares),
      avgCost: Number(avgCost),
      currency,
      usdJpyRate: rate,
    });
    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    setHoldings(result.holdings);
    void savePortfolio(result.holdings);
    setCashJpy(result.cashJpy);
    void saveCashJpy(result.cashJpy);
    recordTrade({
      date: new Date().toISOString(),
      ticker: pending.symbol,
      name: pending.name,
      side: "buy",
      shares: Number(shares),
      price: Number(avgCost),
      currency,
      valueJpy: Math.round(toJpy(Number(shares) * Number(avgCost), currency)),
      plJpy: null,
    }).then((entry) => setTrades((prev) => [...prev, entry]));

    setPending(null);
    setShares("");
    setAvgCost("");
  }

  function handleRemove(id: string) {
    const holding = holdings.find((h) => h.id === id);
    const next = removeHolding(holdings, id);
    setHoldings(next);
    void savePortfolio(next);

    // 全株売却として扱い、売却代金-手数料(SBI証券換算)を手元資金へ自動的に加える
    // (現在値が取れない場合は取得単価を使うため損益ゼロ扱いになる)。
    if (holding) {
      const sellPrice = prices.get(holding.ticker)?.price ?? holding.avgCost;
      const tradeValueNative = sellPrice * holding.shares;
      const feeJpy = brokerCommissionJpy(tradeValueNative, holding.currency, rate);
      const proceedsJpy = toJpy(tradeValueNative, holding.currency) - feeJpy;
      const nextCash = cashJpy + proceedsJpy;
      void saveCashJpy(nextCash);
      setCashJpy(nextCash);

      const costJpy = toJpy(holding.avgCost * holding.shares, holding.currency);
      recordTrade({
        date: new Date().toISOString(),
        ticker: holding.ticker,
        name: holding.name,
        side: "sell",
        shares: holding.shares,
        price: sellPrice,
        currency: holding.currency,
        valueJpy: Math.round(toJpy(tradeValueNative, holding.currency)),
        plJpy: Math.round(proceedsJpy - costJpy),
      }).then((entry) => setTrades((prev) => [...prev, entry]));
    }
  }

  function handleCashDelta(sign: 1 | -1) {
    const n = Number(depositInput);
    if (!Number.isFinite(n) || n <= 0) return;
    const nextCash = cashJpy + sign * n;
    void saveCashJpy(nextCash);
    setCashJpy(nextCash);
    setDepositing(false);
    setDepositInput("");
  }

  const totals: Record<string, { value: number; cost: number }> = {};
  for (const h of holdings) {
    const m = prices.get(h.ticker);
    const price = m?.price ?? h.avgCost;
    const bucket = totals[h.currency] ?? { value: 0, cost: 0 };
    bucket.value += price * h.shares;
    bucket.cost += h.avgCost * h.shares;
    totals[h.currency] = bucket;
  }
  const totalPlJpy = Object.entries(totals).reduce((sum, [currency, t]) => sum + toJpy(t.value - t.cost, currency), 0);

  const sectorTotalsJpy: Record<string, number> = {};
  let totalValueJpy = 0;
  for (const h of holdings) {
    const m = prices.get(h.ticker);
    const price = m?.price ?? h.avgCost;
    const valueJpy = toJpy(price * h.shares, h.currency);
    totalValueJpy += valueJpy;
    const sector = m?.sector ?? "その他";
    sectorTotalsJpy[sector] = (sectorTotalsJpy[sector] ?? 0) + valueJpy;
  }
  const sectorBreakdown = Object.entries(sectorTotalsJpy)
    .map(([sector, value]) => ({ sector, value, pct: totalValueJpy > 0 ? (value / totalValueJpy) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);

  const currencyBreakdown = Object.entries(totals)
    .map(([currency, t]) => {
      const valueJpy = toJpy(t.value, currency);
      return { currency, valueJpy, pct: totalValueJpy > 0 ? (valueJpy / totalValueJpy) * 100 : 0 };
    })
    .sort((a, b) => b.valueJpy - a.valueJpy);

  const positionBreakdown = holdings
    .map((h) => {
      const m = prices.get(h.ticker);
      const price = m?.price ?? h.avgCost;
      const valueJpy = toJpy(price * h.shares, h.currency);
      return { name: h.name, pct: totalValueJpy > 0 ? (valueJpy / totalValueJpy) * 100 : 0 };
    })
    .sort((a, b) => b.pct - a.pct);

  const health = computePortfolioHealth(totalValueJpy, cashJpy, sectorBreakdown, currencyBreakdown, positionBreakdown);

  function handleSaveCash() {
    const n = Number(cashInput);
    const amount = Number.isFinite(n) && n >= 0 ? n : 0;
    void saveCashJpy(amount);
    setCashJpy(amount);
    setEditingCash(false);
  }

  useEffect(() => {
    if (!hydrated || loadingPrices || (holdings.length === 0 && cashJpy === 0)) return;
    let cancelled = false;
    recordSnapshot(totalValueJpy, cashJpy).then(() => getHistory()).then((hist) => {
      if (!cancelled) setHistory(hist);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, loadingPrices, totalValueJpy > 0, cashJpy]);

  return (
    <section hidden={hidden} className="h-full">
      <GlassPageShell>
        {(holdings.length > 0 || cashJpy !== 0) && (
          <div className={`${GLASS_CARD} mb-3 sm:mb-4`}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <div>
                <div className="text-xs text-[var(--text-secondary)]">総資産(円換算)</div>
                <div className="mt-0.5 truncate text-xl font-bold tabular-nums text-[var(--foreground)]">
                  ¥{fmt(totalValueJpy + cashJpy, "JPY")}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-secondary)]">現金(円換算)</div>
                <div className="mt-0.5 truncate text-xl font-bold tabular-nums text-[var(--foreground)]">¥{fmt(cashJpy, "JPY")}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-secondary)]">評価額(株式、円換算)</div>
                <div className="mt-0.5 truncate text-xl font-bold tabular-nums text-[var(--foreground)]">¥{fmt(totalValueJpy, "JPY")}</div>
                {totalPlJpy !== 0 && (
                  <div className="mt-0.5 text-[12.5px] font-semibold tabular-nums" style={{ color: totalPlJpy >= 0 ? GLASS_UP : GLASS_DOWN }}>
                    {totalPlJpy >= 0 ? "▲" : "▼"} ¥{fmt(Math.abs(totalPlJpy), "JPY")}(評価損益)
                  </div>
                )}
              </div>
            </div>
            {Object.keys(totals).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-[var(--border-subtle)] pt-2 text-[11px] text-[var(--text-secondary)]">
                {Object.entries(totals).map(([currency, t]) => (
                  <span key={currency}>
                    {currency}: {currencyPrefix(currency)}
                    {fmt(t.value, currency)}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
              <div className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">総資産の推移(現金+株式、円換算)</div>
              <PortfolioValueChart history={history} />
              <details className="group mt-3">
                <summary className="cursor-pointer list-none text-[11px] font-semibold text-[var(--accent)]">
                  <span className="inline-flex items-center gap-1">
                    売買タイミングつきの詳細グラフを見る
                    <span className="font-normal text-[var(--text-muted)] group-open:hidden">(クリックで開く)</span>
                  </span>
                </summary>
                <div className="mt-3">
                  <PortfolioTradesChart history={history} trades={trades} />
                </div>
              </details>
            </div>

            <div className="mt-4 grid gap-x-4 gap-y-4 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-3">
              <div>
                <div className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">現金/株式の配分</div>
                <AllocationDonutChart
                  size={96}
                  segments={[
                    { label: "株式", value: Math.max(totalValueJpy, 0), color: "var(--accent)" },
                    { label: "現金", value: Math.max(cashJpy, 0), color: "var(--text-muted)" },
                  ]}
                />
              </div>
              {currencyBreakdown.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">通貨別配分(株式のみ)</div>
                  <AllocationDonutChart
                    size={96}
                    segments={currencyBreakdown.map((c) => ({
                      label: c.currency,
                      value: c.valueJpy,
                      color: fixedColor(c.currency, CURRENCY_ORDER),
                    }))}
                  />
                  {usdJpyRate == null && <div className="mt-2 text-[11px] text-[var(--text-muted)]">為替レート取得中(概算 ¥150/$)</div>}
                </div>
              )}
              {sectorBreakdown.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">セクター別配分(株式のみ)</div>
                  <AllocationDonutChart
                    size={96}
                    segments={sectorBreakdown.map((s) => ({
                      label: sectorLabelJa(s.sector),
                      value: s.value,
                      color: fixedColor(s.sector, SECTOR_ORDER),
                    }))}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <div className={`${GLASS_CARD} mb-3 sm:mb-4`}>
          <div className="flex items-center gap-2">
            <ClipboardCheck size={15} strokeWidth={2.25} className="text-[var(--accent)]" />
            <h2 className="text-[12.5px] font-extrabold text-[var(--foreground)]">ポートフォリオアドバイザー</h2>
            {health && (
              <span
                className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                style={{ background: HEALTH_COLOR[health.overallLevel] }}
              >
                {HEALTH_LABEL[health.overallLevel]}
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-[var(--fill-subtle)] px-3 py-2">
            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">手元資金(円換算):</span>
            {editingCash ? (
              <>
                <input
                  type="number"
                  min="0"
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                  placeholder="1000000"
                  className="w-32 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[12.5px]"
                  autoFocus
                />
                <button onClick={handleSaveCash} className="rounded-full bg-[var(--accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white">
                  保存
                </button>
                <button onClick={() => setEditingCash(false)} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--foreground)]">
                  キャンセル
                </button>
              </>
            ) : depositing ? (
              <>
                <input
                  type="number"
                  min="0"
                  value={depositInput}
                  onChange={(e) => setDepositInput(e.target.value)}
                  placeholder="100000"
                  className="w-32 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[12.5px]"
                  autoFocus
                />
                <button onClick={() => handleCashDelta(1)} className="rounded-full bg-[var(--accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white">
                  入金する
                </button>
                <button onClick={() => handleCashDelta(-1)} className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                  出金する
                </button>
                <button onClick={() => setDepositing(false)} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--foreground)]">
                  キャンセル
                </button>
              </>
            ) : (
              <>
                <span className="text-[12.5px] font-bold tabular-nums" style={{ color: cashJpy < 0 ? GLASS_DOWN : "var(--foreground)" }}>
                  {cashJpy < 0 ? "−" : ""}¥{fmt(Math.abs(cashJpy), "JPY")}
                </span>
                <button
                  onClick={() => {
                    setDepositInput("");
                    setDepositing(true);
                  }}
                  className="text-[11px] text-[var(--accent)] hover:underline"
                >
                  入金/出金
                </button>
                <button
                  onClick={() => {
                    setCashInput(String(cashJpy || ""));
                    setEditingCash(true);
                  }}
                  className="text-[11px] text-[var(--text-muted)] hover:underline"
                >
                  残高を直接修正
                </button>
              </>
            )}
            <span className="text-[11px] text-[var(--text-muted)]">— 銘柄の購入/売却で自動的に増減します。「運用アドバイザー」タブの買い推奨サイジングにも使われます</span>
          </div>
          {cashJpy < 0 && (
            <p className="mt-1.5 text-[11px] text-[var(--price-up)]">
              手元資金がマイナスです。入金の記録漏れがあるか、確認してみてください。
            </p>
          )}

          {health ? (
            <ul className="mt-3 space-y-1.5">
              {health.items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px]">
                  <span
                    className="mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white"
                    style={{ background: HEALTH_COLOR[item.level] }}
                  >
                    {HEALTH_LABEL[item.level]}
                  </span>
                  <span className="text-[var(--foreground)]">{item.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[11px] text-[var(--text-muted)]">保有銘柄と手元資金を入力すると、健全性のチェック結果が表示されます。</p>
          )}
        </div>

        <div className={`${GLASS_CARD} mb-3 overflow-hidden p-0 sm:mb-4`}>
        <div className="p-3 sm:p-4">
          <h2 className="text-[12.5px] font-extrabold text-[var(--foreground)]">銘柄を購入</h2>
          <p className="mb-2 mt-1 text-[11px] text-[var(--text-muted)]">購入代金+手数料(SBI証券換算)を上の手元資金から自動的に差し引きます。</p>
          <StockSearchBar
            onSelect={(symbol, name) => {
              setPending({ symbol, name });
              setFormError(null);
              setShares("");
              setAvgCost("");
              fetchMetricsBatch([symbol]).then((res) => {
                const p = res.get(symbol)?.price;
                if (p != null) setAvgCost(String(p));
              });
            }}
          />
          {pending &&
            (() => {
              const pendingCurrency = prices.get(pending.symbol)?.currency ?? (pending.symbol.endsWith(".T") ? "JPY" : "USD");
              const sharesNum = Number(shares);
              const avgCostNum = Number(avgCost);
              const hasTotal = Number.isFinite(sharesNum) && sharesNum > 0 && Number.isFinite(avgCostNum) && avgCostNum > 0;
              const totalNative = hasTotal ? sharesNum * avgCostNum : 0;
              const feeJpy = hasTotal ? brokerCommissionJpy(totalNative, pendingCurrency, rate) : 0;
              const totalJpy = toJpy(totalNative, pendingCurrency) + feeJpy;
              return (
                <div className="mt-2 flex flex-wrap items-end gap-3 rounded-xl bg-[var(--fill-subtle)] p-3">
                  <div className="text-sm font-semibold text-[var(--foreground)]">
                    {pending.name} <span className="text-xs text-[var(--text-secondary)]">{pending.symbol}</span>
                  </div>
                  <label className="flex flex-col text-xs text-[var(--text-secondary)]">
                    株数
                    <input
                      type="number"
                      min="0"
                      value={shares}
                      onChange={(e) => setShares(e.target.value)}
                      className="mt-1 w-24 rounded-md border border-[var(--border-subtle)] px-2 py-1 text-sm"
                      placeholder="100"
                    />
                  </label>
                  <label className="flex flex-col text-xs text-[var(--text-secondary)]">
                    平均取得単価
                    <input
                      type="number"
                      min="0"
                      value={avgCost}
                      onChange={(e) => setAvgCost(e.target.value)}
                      className="mt-1 w-28 rounded-md border border-[var(--border-subtle)] px-2 py-1 text-sm"
                      placeholder="2500"
                    />
                  </label>
                  <button onClick={handleAdd} className={GLASS_BTN_PRIMARY}>
                    購入する
                  </button>
                  <button onClick={() => setPending(null)} className="rounded-full px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--foreground)]">
                    キャンセル
                  </button>
                  {hasTotal && (
                    <div className="w-full text-xs text-[var(--text-secondary)]">
                      合計 {currencyPrefix(pendingCurrency)}
                      {fmt(totalNative, pendingCurrency)}
                      {pendingCurrency !== "JPY" && <> (手数料込み約¥{Math.round(totalJpy).toLocaleString("ja-JP")})</>}
                      {pendingCurrency === "JPY" && feeJpy > 0 && <> (手数料込み¥{Math.round(totalJpy).toLocaleString("ja-JP")})</>}
                    </div>
                  )}
                </div>
              );
            })()}
          {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
        </div>

        <div className="border-t border-[var(--border-faint)]">
          {holdings.length > 0 && (
            <div className="flex justify-end px-3 py-2 sm:px-4">
              <button
                onClick={() => exportPortfolioCsv(holdings, prices)}
                className="rounded-full border border-[var(--border-subtle)] bg-white/70 px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
              >
                CSVでエクスポート
              </button>
            </div>
          )}
          {holdings.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-secondary)]">
              まだ保有銘柄がありません。上の検索から追加してください。
            </div>
          ) : (
            <>
            {/* スマホ幅では横スクロール前提の表ではなく、1銘柄1カードの縦積みリストにする
                (取得単価は株数と1行にまとめ、画面内に収まるようにする)。 */}
            <div className="divide-y divide-[var(--border-faint)] md:hidden">
              {holdings.map((h) => {
                const m = prices.get(h.ticker);
                const price = m?.price ?? null;
                const value = (price ?? h.avgCost) * h.shares;
                const cost = h.avgCost * h.shares;
                const pl = value - cost;
                const plPct = cost > 0 ? (pl / cost) * 100 : 0;
                const up = pl >= 0;
                return (
                  <div key={h.id} className="flex flex-col gap-1.5 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => onOpenDetail(h.ticker, h.name)}
                        className="min-w-0 text-left"
                      >
                        <div className="font-semibold text-[var(--foreground)] hover:text-[var(--accent)] hover:underline">{h.name}</div>
                        <div className="font-mono text-[11px] text-[var(--text-secondary)]">
                          {h.ticker} ・ {h.shares.toLocaleString()}株 @ {currencyPrefix(h.currency)}
                          {fmt(h.avgCost, h.currency)}
                        </div>
                      </button>
                      <button onClick={() => handleRemove(h.id)} className="shrink-0 text-xs text-[var(--text-muted)] hover:text-red-600">
                        売却
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[15px] tabular-nums">
                      <span className="text-[var(--foreground)]">
                        {loadingPrices && price == null ? "…" : price != null ? `${currencyPrefix(h.currency)}${fmt(price, h.currency)}` : "—"}
                      </span>
                      <span className="flex items-center gap-1 font-semibold" style={{ color: up ? GLASS_UP : GLASS_DOWN }}>
                        {currencyPrefix(h.currency)}
                        {fmt(Math.abs(pl), h.currency)} ({plPct >= 0 ? "+" : ""}
                        {plPct.toFixed(1)}%)
                        <TrailingStopBadge
                          price={price}
                          priceVs50ma={m?.priceVs50ma ?? null}
                          currency={h.currency}
                          isProfitable={pl > 0}
                        />
                      </span>
                    </div>
                    <div className="text-right text-[11px] text-[var(--text-muted)]">
                      評価額 {currencyPrefix(h.currency)}
                      {fmt(value, h.currency)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--fill-subtle)] text-left text-xs text-[var(--text-secondary)]">
                <tr>
                  <th className="px-4 py-2 font-medium">銘柄</th>
                  <th className="px-4 py-2 font-medium">株数</th>
                  <th className="px-4 py-2 font-medium">取得単価</th>
                  <th className="px-4 py-2 font-medium">現在値</th>
                  <th className="px-4 py-2 font-medium">評価額</th>
                  <th className="px-4 py-2 font-medium">評価損益</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const m = prices.get(h.ticker);
                  const price = m?.price ?? null;
                  const value = (price ?? h.avgCost) * h.shares;
                  const cost = h.avgCost * h.shares;
                  const pl = value - cost;
                  const plPct = cost > 0 ? (pl / cost) * 100 : 0;
                  const up = pl >= 0;
                  return (
                    <tr key={h.id} className="border-b border-[var(--border-faint)] last:border-0">
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => onOpenDetail(h.ticker, h.name)}
                          className="text-left font-semibold text-[var(--foreground)] hover:text-[var(--accent)] hover:underline"
                        >
                          {h.name}
                        </button>
                        <div className="font-mono text-xs text-[var(--text-secondary)]">{h.ticker}</div>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--foreground)]">{h.shares.toLocaleString()}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--foreground)]">
                        {currencyPrefix(h.currency)}
                        {fmt(h.avgCost, h.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-[15px] tabular-nums text-[var(--foreground)]">
                        {loadingPrices && price == null
                          ? "…"
                          : price != null
                          ? `${currencyPrefix(h.currency)}${fmt(price, h.currency)}`
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--foreground)]">
                        {currencyPrefix(h.currency)}
                        {fmt(value, h.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-[15px] tabular-nums font-semibold" style={{ color: up ? GLASS_UP : GLASS_DOWN }}>
                        {currencyPrefix(h.currency)}
                        {fmt(Math.abs(pl), h.currency)} ({plPct >= 0 ? "+" : ""}
                        {plPct.toFixed(1)}%)
                        <TrailingStopBadge
                          price={price}
                          priceVs50ma={m?.priceVs50ma ?? null}
                          currency={h.currency}
                          isProfitable={pl > 0}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => handleRemove(h.id)} className="text-xs text-[var(--text-muted)] hover:text-red-600">
                          売却
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            </>
          )}
        </div>
        </div>
        <p className="mb-4 mt-3 text-xs text-[var(--text-muted)]">
          保有情報はこの端末に保存されます(Upstash設定時は端末間で同期)。「売却」は全株売却として扱い、現在値(取れない場合は取得単価)で売却代金-手数料を手元資金へ加算します。
        </p>
      </GlassPageShell>
    </section>
  );
}
