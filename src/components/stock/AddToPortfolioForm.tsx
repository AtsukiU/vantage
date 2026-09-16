"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, Check, X } from "lucide-react";
import { loadPortfolio, savePortfolio, loadCashJpy, saveCashJpy, buyHolding } from "@/lib/portfolioStore";
import { recordTrade } from "@/lib/portfolioTradeLog";
import { fetchMetricsBatch } from "@/lib/fetchMetricsBatch";
import { brokerCommissionJpy } from "@/lib/brokerFees";
import { GLASS_BTN_PRIMARY } from "@/lib/glassStyles";

// 銘柄詳細ページから直接ポートフォリオへ追加できる、小さな購入フォーム。ポートフォリオタブの
// 購入フォームと違い、銘柄はこのページで見ている銘柄に固定なので銘柄検索は不要。
// 手数料込みの資金チェック・保存ロジックはportfolioStore.tsのbuyHoldingに共通化してある。
export function AddToPortfolioForm({
  symbol,
  name,
  currentPrice,
  currency,
  buyReason,
  onBought,
}: {
  symbol: string;
  name: string;
  currentPrice: number | null;
  currency: string | null;
  buyReason?: string | null; // 運用アドバイザーの推奨から遷移してきた場合の根拠(投資家名など)
  onBought?: () => void;
}) {
  // 推奨から遷移してきた場合は最初からフォームを開いておく(すぐ株数を入力できるように)。
  const [open, setOpen] = useState(() => !!buyReason);
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState(() => (buyReason && currentPrice != null ? String(currentPrice) : ""));
  const [cashJpy, setCashJpy] = useState<number | null>(null);
  const [rate, setRate] = useState(150);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadCashJpy().then((c) => {
      if (!cancelled) setCashJpy(c);
    });
    fetchMetricsBatch(["JPY=X"]).then((m) => {
      const r = m.get("JPY=X")?.price;
      if (r && !cancelled) setRate(r);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function handleOpen() {
    setAvgCost(currentPrice != null ? String(currentPrice) : "");
    setOpen(true);
  }

  async function handleSubmit() {
    setError(null);
    const cur = currency ?? (symbol.endsWith(".T") ? "JPY" : "USD");
    const holdings = await loadPortfolio();
    const result = buyHolding({
      holdings,
      cashJpy: cashJpy ?? 0,
      ticker: symbol,
      name,
      shares: Number(shares),
      avgCost: Number(avgCost),
      currency: cur,
      usdJpyRate: rate,
      buyReason: buyReason ?? undefined,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await savePortfolio(result.holdings);
    await saveCashJpy(result.cashJpy);
    setCashJpy(result.cashJpy);
    onBought?.();
    const sharesNum = Number(shares);
    const avgCostNum = Number(avgCost);
    void recordTrade({
      date: new Date().toISOString(),
      ticker: symbol,
      name,
      side: "buy",
      shares: sharesNum,
      price: avgCostNum,
      currency: cur,
      valueJpy: Math.round(cur === "JPY" ? sharesNum * avgCostNum : sharesNum * avgCostNum * rate),
      plJpy: null,
    });
    setSuccess(true);
    setShares("");
    window.setTimeout(() => {
      setSuccess(false);
      setOpen(false);
    }, 1300);
  }

  const inputBase =
    "w-full rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[12.5px] font-mono outline-none focus:border-[var(--accent)]";

  if (!open) {
    return (
      <motion.button
        onClick={handleOpen}
        whileTap={{ scale: 0.97 }}
        className={`${GLASS_BTN_PRIMARY} inline-flex items-center gap-1.5`}
      >
        <Wallet size={14} strokeWidth={2.25} />
        ポートフォリオに追加
      </motion.button>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {success ? (
        <motion.div
          key="success"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="flex items-center gap-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2.5 text-[12.5px] font-semibold text-[var(--status-good)]"
        >
          <Check size={16} strokeWidth={2.5} />
          ポートフォリオに追加しました
        </motion.div>
      ) : (
        <motion.div
          key="form"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="w-full min-w-[240px] rounded-[10px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-[var(--foreground)]">ポートフォリオに追加</span>
            <button onClick={() => setOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--foreground)]">
              <X size={14} strokeWidth={2.25} />
            </button>
          </div>
          {buyReason && (
            <p className="mt-1 text-[11px] text-[var(--accent)]">
              「{buyReason}」の推奨から追加 — 保有銘柄一覧にバッジとして残ります
            </p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-[var(--text-secondary)]">
              株数
              <input
                type="number"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="例: 100"
                className={inputBase}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-[var(--text-secondary)]">
              平均取得単価
              <input type="number" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} className={inputBase} />
            </label>
          </div>
          {(() => {
            const cur = currency ?? (symbol.endsWith(".T") ? "JPY" : "USD");
            const sharesNum = Number(shares);
            const avgCostNum = Number(avgCost);
            const hasTotal = Number.isFinite(sharesNum) && sharesNum > 0 && Number.isFinite(avgCostNum) && avgCostNum > 0;
            if (!hasTotal) return null;
            const totalNative = sharesNum * avgCostNum;
            const feeJpy = brokerCommissionJpy(totalNative, cur, rate);
            const totalJpy = (cur === "JPY" ? totalNative : totalNative * rate) + feeJpy;
            return (
              <p className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
                合計 {cur === "JPY" ? "¥" : cur === "USD" ? "$" : ""}
                {totalNative.toLocaleString("ja-JP", { minimumFractionDigits: cur === "JPY" ? 0 : 2, maximumFractionDigits: cur === "JPY" ? 0 : 2 })}
                {cur !== "JPY" && <>(手数料込み約¥{Math.round(totalJpy).toLocaleString("ja-JP")})</>}
                {cur === "JPY" && feeJpy > 0 && <>(手数料込み¥{Math.round(totalJpy).toLocaleString("ja-JP")})</>}
              </p>
            );
          })()}
          {cashJpy != null && (
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">手元資金: ¥{Math.round(cashJpy).toLocaleString("ja-JP")}</p>
          )}
          {error && <p className="mt-1.5 text-[11px] font-semibold text-[var(--price-up)]">{error}</p>}
          <button onClick={handleSubmit} className={`${GLASS_BTN_PRIMARY} mt-2.5 w-full justify-center`}>
            購入する
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
