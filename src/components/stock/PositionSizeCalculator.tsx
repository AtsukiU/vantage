"use client";

import { useEffect, useState } from "react";
import { calcPositionSize } from "@/lib/positionSizing";
import { loadLocal, saveLocal } from "@/lib/localStore";

const PREFS_KEY = "stockapp.positionSizingPrefs.v1";

interface Prefs {
  accountValue: string;
  riskPercent: string;
  rewardMultiple: string;
}

const DEFAULT_PREFS: Prefs = { accountValue: "", riskPercent: "1", rewardMultiple: "2" };

async function loadPrefs(): Promise<Prefs> {
  const parsed = await loadLocal<Partial<Prefs>>(PREFS_KEY, DEFAULT_PREFS);
  return {
    accountValue: parsed.accountValue ?? "",
    riskPercent: parsed.riskPercent ?? "1",
    rewardMultiple: parsed.rewardMultiple ?? "2",
  };
}

async function savePrefs(prefs: Prefs): Promise<void> {
  await saveLocal(PREFS_KEY, prefs);
}

export function PositionSizeCalculator({
  currentPrice,
  currency,
}: {
  currentPrice: number | null;
  currency: string | null;
}) {
  const [accountValue, setAccountValue] = useState("");
  const [riskPercent, setRiskPercent] = useState("1");
  const [rewardMultiple, setRewardMultiple] = useState("2");
  const [entryPrice, setEntryPrice] = useState(currentPrice != null ? String(currentPrice) : "");
  const [stopPrice, setStopPrice] = useState(
    currentPrice != null ? String(Math.round(currentPrice * 0.92 * 100) / 100) : ""
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadPrefs().then((prefs) => {
      if (cancelled) return;
      setAccountValue(prefs.accountValue);
      setRiskPercent(prefs.riskPercent);
      setRewardMultiple(prefs.rewardMultiple);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void savePrefs({ accountValue, riskPercent, rewardMultiple });
  }, [hydrated, accountValue, riskPercent, rewardMultiple]);

  const currencyPrefix = currency === "JPY" ? "¥" : currency === "USD" ? "$" : "";
  const fmt = (n: number) => `${currencyPrefix}${n.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}`;

  const result = calcPositionSize({
    accountValue: Number(accountValue),
    riskPercent: Number(riskPercent),
    entryPrice: Number(entryPrice),
    stopPrice: Number(stopPrice),
    rewardMultiple: Number(rewardMultiple),
  });

  const inputBase =
    "w-full rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[12.5px] font-mono outline-none focus:border-[var(--accent)]";

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[11px] text-[var(--text-secondary)]">
          口座評価額
          <input
            type="number"
            value={accountValue}
            onChange={(e) => setAccountValue(e.target.value)}
            placeholder="例: 1000000"
            className={inputBase}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-[var(--text-secondary)]">
          許容リスク(口座に対する%)
          <input
            type="number"
            step="0.5"
            value={riskPercent}
            onChange={(e) => setRiskPercent(e.target.value)}
            className={inputBase}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-[var(--text-secondary)]">
          リスクリワード比(利確目標)
          <input
            type="number"
            step="0.5"
            value={rewardMultiple}
            onChange={(e) => setRewardMultiple(e.target.value)}
            className={inputBase}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-[var(--text-secondary)]">
          エントリー価格
          <input type="number" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} className={inputBase} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-[var(--text-secondary)]">
          損切りライン
          <input type="number" value={stopPrice} onChange={(e) => setStopPrice(e.target.value)} className={inputBase} />
        </label>
      </div>

      {result ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-4">
            <div>
              <div className="text-[11px] text-[var(--text-muted)]">最大株数</div>
              <div className="font-mono text-[15px] font-extrabold text-[var(--foreground)]">{result.maxShares.toLocaleString()}株</div>
            </div>
            <div>
              <div className="text-[11px] text-[var(--text-muted)]">ポジション評価額</div>
              <div className="font-mono text-[15px] font-extrabold text-[var(--foreground)]">{fmt(result.positionValue)}</div>
              <div className="text-[11px] text-[var(--text-secondary)]">口座の{result.positionPercentOfAccount}%</div>
            </div>
            <div>
              <div className="text-[11px] text-[var(--text-muted)]">損切り幅</div>
              <div className="font-mono text-[15px] font-extrabold text-[var(--price-down)]">-{result.stopLossPercent}%</div>
              <div className="text-[11px] text-[var(--text-secondary)]">1株あたり{fmt(result.riskPerShare)}</div>
            </div>
            <div>
              <div className="text-[11px] text-[var(--text-muted)]">最大損失額</div>
              <div className="font-mono text-[15px] font-extrabold text-[var(--price-down)]">{fmt(result.totalRiskAmount)}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-4">
            <div>
              <div className="text-[11px] text-[var(--text-muted)]">利確ライン</div>
              <div className="font-mono text-[15px] font-extrabold text-[var(--price-up)]">{fmt(result.targetPrice)}</div>
              <div className="text-[11px] text-[var(--text-secondary)]">+{result.takeProfitPercent}%</div>
            </div>
            <div>
              <div className="text-[11px] text-[var(--text-muted)]">想定利益額</div>
              <div className="font-mono text-[15px] font-extrabold text-[var(--price-up)]">{fmt(result.potentialGainTotal)}</div>
            </div>
            <div>
              <div className="text-[11px] text-[var(--text-muted)]">リスクリワード比</div>
              <div className="font-mono text-[15px] font-extrabold text-[var(--foreground)]">1 : {Number(rewardMultiple).toFixed(1)}</div>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-[11px] text-[var(--text-muted)]">
          口座評価額・エントリー価格・損切りライン(エントリーより低い価格)を入力してください。
        </p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
        「1トレードあたり口座の1〜2%までしかリスクを取らない」という考え方に基づく計算です。利確ラインは損切り幅に対するリスクリワード比から逆算した目安で、必ず届く価格ではありません。買いポジション(ロング)前提で、空売りには対応していません。
      </p>
    </div>
  );
}
