"use client";

import { useEffect, useState } from "react";
import { GlassPageShell } from "../GlassPageShell";
import { StockSearchBar } from "../stock/StockSearchBar";
import {
  addHolding,
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
import { computePortfolioHealth, type HealthLevel } from "@/lib/portfolioHealth";
import { PortfolioValueChart } from "./PortfolioValueChart";
import { AllocationDonutChart } from "./AllocationDonutChart";
import { TrailingStopBadge } from "../TrailingStopBadge";
import { StatTile } from "../StatTile";
import { ClipboardCheck, Layers, Wallet, TrendingUp } from "lucide-react";

const HEALTH_COLOR: Record<HealthLevel, string> = { good: "#2f9e5c", watch: "#cf9a4c", warning: "#c0392b" };
const HEALTH_LABEL: Record<HealthLevel, string> = { good: "良好", watch: "注意", warning: "要改善" };

const ALLOCATION_COLORS = ["#c9962f", "#2f6fb0", "#c0392b", "#a9843b", "#6c6656", "#8f6ea3", "#3f8f8f", "#a39d8c"];

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
  const [cashJpy, setCashJpy] = useState(0);
  const [cashInput, setCashInput] = useState("");
  const [editingCash, setEditingCash] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [depositInput, setDepositInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadPortfolio(), getHistory(), loadCashJpy()]).then(([h, hist, cash]) => {
      if (cancelled) return;
      setHoldings(h);
      setHistory(hist);
      setCashJpy(cash);
      setHydrated(true);
    });
    fetchMetricsBatch(["JPY=X"]).then((res) => {
      const rate = res.get("JPY=X")?.price;
      if (rate && !cancelled) setUsdJpyRate(rate);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    const sharesNum = Number(shares);
    const costNum = Number(avgCost);
    if (!Number.isFinite(sharesNum) || sharesNum <= 0) {
      setFormError("株数を正しく入力してください");
      return;
    }
    if (!Number.isFinite(costNum) || costNum <= 0) {
      setFormError("平均取得単価を正しく入力してください");
      return;
    }
    const meta = prices.get(pending.symbol);
    const currency = meta?.currency ?? (pending.symbol.endsWith(".T") ? "JPY" : "USD");

    // 購入代金+手数料(SBI証券換算)が手元資金を超える場合は購入自体を弾く。
    const tradeValueNative = sharesNum * costNum;
    const feeJpy = brokerCommissionJpy(tradeValueNative, currency, rate);
    const costJpy = toJpy(tradeValueNative, currency) + feeJpy;
    if (costJpy > cashJpy) {
      setFormError(`手元資金が不足しています(必要 ¥${Math.round(costJpy).toLocaleString("ja-JP")} / 保有 ¥${Math.round(cashJpy).toLocaleString("ja-JP")})`);
      return;
    }

    const next = addHolding(holdings, {
      ticker: pending.symbol,
      name: pending.name,
      shares: sharesNum,
      avgCost: costNum,
      currency,
    });
    setHoldings(next);
    void savePortfolio(next);

    const nextCash = cashJpy - costJpy;
    void saveCashJpy(nextCash);
    setCashJpy(nextCash);

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
    <section hidden={hidden}>
      <GlassPageShell maxWidth="max-w-4xl">
        {(holdings.length > 0 || cashJpy !== 0) && (
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              <StatTile
                variant="hero"
                icon={Layers}
                iconColor="#c9962f"
                label="総資産(円換算)"
                value={`¥${fmt(totalValueJpy + cashJpy, "JPY")}`}
              />
              <StatTile
                icon={Wallet}
                iconColor="#cf9a4c"
                label="現金(円換算)"
                value={`¥${fmt(cashJpy, "JPY")}`}
              />
              <StatTile
                icon={TrendingUp}
                iconColor="#2f6fb0"
                label="評価額(株式、円換算)"
                value={`¥${fmt(totalValueJpy, "JPY")}`}
                delta={
                  totalPlJpy !== 0
                    ? { text: `${totalPlJpy >= 0 ? "▲" : "▼"} ¥${fmt(Math.abs(totalPlJpy), "JPY")}(評価損益)`, positive: totalPlJpy >= 0 }
                    : null
                }
              >
                {Object.keys(totals).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-[#e2dfd2] pt-2 text-[10.5px] text-[#6c6656]">
                    {Object.entries(totals).map(([currency, t]) => (
                      <span key={currency}>
                        {currency}: {currencyPrefix(currency)}
                        {fmt(t.value, currency)}
                      </span>
                    ))}
                  </div>
                )}
              </StatTile>
            </div>
            {currencyBreakdown.length > 0 && (
              <div className={`${GLASS_CARD} sm:w-56 sm:shrink-0`}>
                <div className="mb-2 text-xs font-semibold text-[#6c6656]">通貨別配分(株式のみ)</div>
                <AllocationDonutChart
                  segments={currencyBreakdown.map((c, i) => ({
                    label: c.currency,
                    value: c.valueJpy,
                    color: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
                  }))}
                />
                {usdJpyRate == null && <div className="mt-2 text-[10.5px] text-[#a39d8c]">為替レート取得中(概算 ¥150/$)</div>}
              </div>
            )}
          </div>
        )}

        <div className={`${GLASS_CARD} mb-4`}>
          <div className="flex items-center gap-2">
            <ClipboardCheck size={15} strokeWidth={2.25} className="text-[#c9962f]" />
            <h2 className="text-[13px] font-extrabold text-[#1c1b18]">ポートフォリオアドバイザー</h2>
            {health && (
              <span
                className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                style={{ background: HEALTH_COLOR[health.overallLevel] }}
              >
                {HEALTH_LABEL[health.overallLevel]}
              </span>
            )}
          </div>
          <p className="mt-1 text-[10.5px] text-[#a39d8c]">
            銘柄の売買判断はしません。現金比率・セクター/通貨/銘柄の集中度など、資産配分の健全性だけを毎回チェックします。
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-[#f7f6f1] px-3 py-2">
            <span className="text-[11px] font-semibold text-[#6c6656]">手元資金(円換算):</span>
            {editingCash ? (
              <>
                <input
                  type="number"
                  min="0"
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                  placeholder="1000000"
                  className="w-32 rounded-md border border-[#e2dfd2] px-2 py-1 text-[12px]"
                  autoFocus
                />
                <button onClick={handleSaveCash} className="rounded-full bg-[#c9962f] px-2.5 py-1 text-[11px] font-semibold text-white">
                  保存
                </button>
                <button onClick={() => setEditingCash(false)} className="text-[11px] text-[#a39d8c] hover:text-[#1c1b18]">
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
                  className="w-32 rounded-md border border-[#e2dfd2] px-2 py-1 text-[12px]"
                  autoFocus
                />
                <button onClick={() => handleCashDelta(1)} className="rounded-full bg-[#c9962f] px-2.5 py-1 text-[11px] font-semibold text-white">
                  入金する
                </button>
                <button onClick={() => handleCashDelta(-1)} className="rounded-full border border-[#e2dfd2] px-2.5 py-1 text-[11px] font-semibold text-[#6c6656]">
                  出金する
                </button>
                <button onClick={() => setDepositing(false)} className="text-[11px] text-[#a39d8c] hover:text-[#1c1b18]">
                  キャンセル
                </button>
              </>
            ) : (
              <>
                <span className="text-[13px] font-bold tabular-nums" style={{ color: cashJpy < 0 ? GLASS_DOWN : "#1c1b18" }}>
                  {cashJpy < 0 ? "−" : ""}¥{fmt(Math.abs(cashJpy), "JPY")}
                </span>
                <button
                  onClick={() => {
                    setDepositInput("");
                    setDepositing(true);
                  }}
                  className="text-[11px] text-[#c9962f] hover:underline"
                >
                  入金/出金
                </button>
                <button
                  onClick={() => {
                    setCashInput(String(cashJpy || ""));
                    setEditingCash(true);
                  }}
                  className="text-[11px] text-[#a39d8c] hover:underline"
                >
                  残高を直接修正
                </button>
              </>
            )}
            <span className="text-[10px] text-[#a39d8c]">— 銘柄の購入/売却で自動的に増減します。「運用アドバイザー」タブの買い推奨サイジングにも使われます</span>
          </div>
          {cashJpy < 0 && (
            <p className="mt-1.5 text-[10.5px] text-[#c0392b]">
              手元資金がマイナスです。入金の記録漏れがあるか、確認してみてください。
            </p>
          )}

          {health ? (
            <ul className="mt-3 space-y-1.5">
              {health.items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-[11.5px]">
                  <span
                    className="mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white"
                    style={{ background: HEALTH_COLOR[item.level] }}
                  >
                    {HEALTH_LABEL[item.level]}
                  </span>
                  <span className="text-[#1c1b18]">{item.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[11.5px] text-[#a39d8c]">保有銘柄と手元資金を入力すると、健全性のチェック結果が表示されます。</p>
          )}
        </div>

        {(holdings.length > 0 || cashJpy !== 0) && (
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className={`${GLASS_CARD} sm:col-span-2`}>
              <div className="mb-2 text-xs font-semibold text-[#6c6656]">総資産の推移(現金+株式、円換算)</div>
              <PortfolioValueChart history={history} />
            </div>
            <div className={GLASS_CARD}>
              <div className="mb-2 text-xs font-semibold text-[#6c6656]">現金/株式の配分</div>
              <AllocationDonutChart
                segments={[
                  { label: "株式", value: Math.max(totalValueJpy, 0), color: "#c9962f" },
                  { label: "現金", value: Math.max(cashJpy, 0), color: "#a39d8c" },
                ]}
              />
            </div>
          </div>
        )}

        {sectorBreakdown.length > 0 && (
          <div className={`${GLASS_CARD} mb-4`}>
            <div className="mb-2 text-xs font-semibold text-[#6c6656]">セクター別配分(株式のみ)</div>
            <AllocationDonutChart
              segments={sectorBreakdown.map((s, i) => ({
                label: s.sector,
                value: s.value,
                color: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
              }))}
            />
          </div>
        )}

        <div className={`${GLASS_CARD} mb-4`}>
          <h2 className="text-[13px] font-extrabold text-[#1c1b18]">銘柄を購入</h2>
          <p className="mb-2 mt-1 text-[10.5px] text-[#a39d8c]">購入代金+手数料(SBI証券換算)を上の手元資金から自動的に差し引きます。</p>
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
          {pending && (
            <div className="mt-2 flex flex-wrap items-end gap-3 rounded-xl bg-[#f7f6f1] p-3">
              <div className="text-sm font-semibold text-[#1c1b18]">
                {pending.name} <span className="text-xs text-[#6c6656]">{pending.symbol}</span>
              </div>
              <label className="flex flex-col text-xs text-[#6c6656]">
                株数
                <input
                  type="number"
                  min="0"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  className="mt-1 w-24 rounded-md border border-[#e2dfd2] px-2 py-1 text-sm"
                  placeholder="100"
                />
              </label>
              <label className="flex flex-col text-xs text-[#6c6656]">
                平均取得単価
                <input
                  type="number"
                  min="0"
                  value={avgCost}
                  onChange={(e) => setAvgCost(e.target.value)}
                  className="mt-1 w-28 rounded-md border border-[#e2dfd2] px-2 py-1 text-sm"
                  placeholder="2500"
                />
              </label>
              <button onClick={handleAdd} className={GLASS_BTN_PRIMARY}>
                購入する
              </button>
              <button onClick={() => setPending(null)} className="rounded-full px-3 py-1.5 text-sm text-[#6c6656] hover:text-[#1c1b18]">
                キャンセル
              </button>
            </div>
          )}
          {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
        </div>

        {holdings.length > 0 && (
          <div className="mb-2 flex justify-end">
            <button
              onClick={() => exportPortfolioCsv(holdings, prices)}
              className="rounded-full border border-[#e2dfd2] bg-white/70 px-3 py-1.5 text-xs text-[#6c6656] transition hover:border-[#c9962f]/40 hover:text-[#c9962f]"
            >
              CSVでエクスポート
            </button>
          </div>
        )}

        <div className={`${GLASS_CARD} overflow-hidden p-0`}>
          {holdings.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#6c6656]">
              まだ保有銘柄がありません。上の検索から追加してください。
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-[#e2dfd2] bg-[#f7f6f1] text-left text-xs text-[#6c6656]">
                <tr>
                  <th className="px-4 py-2 font-medium">銘柄</th>
                  <th className="px-4 py-2 font-medium">株数</th>
                  <th className="px-4 py-2 font-medium">取得単価</th>
                  <th className="px-4 py-2 font-medium">現在値</th>
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
                    <tr key={h.id} className="border-b border-[#efece2] last:border-0">
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => onOpenDetail(h.ticker, h.name)}
                          className="text-left font-semibold text-[#1c1b18] hover:text-[#c9962f] hover:underline"
                        >
                          {h.name}
                        </button>
                        <div className="font-mono text-xs text-[#6c6656]">{h.ticker}</div>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-[#1c1b18]">{h.shares.toLocaleString()}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[#1c1b18]">
                        {currencyPrefix(h.currency)}
                        {fmt(h.avgCost, h.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-[15px] tabular-nums text-[#1c1b18]">
                        {loadingPrices && price == null
                          ? "…"
                          : price != null
                          ? `${currencyPrefix(h.currency)}${fmt(price, h.currency)}`
                          : "—"}
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
                        <button onClick={() => handleRemove(h.id)} className="text-xs text-[#a39d8c] hover:text-red-600">
                          売却
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
        <p className="mb-4 mt-3 text-xs text-[#a39d8c]">
          保有情報はこのブラウザにのみ保存されます。「売却」は全株売却として扱い、現在値(取れない場合は取得単価)で売却代金-手数料を手元資金へ加算します。
        </p>
      </GlassPageShell>
    </section>
  );
}
