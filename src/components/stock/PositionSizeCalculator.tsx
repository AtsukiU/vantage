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
    "w-full rounded-lg border border-[#e2dfd2] px-2.5 py-1.5 text-[13px] font-mono outline-none focus:border-[#c9962f]";

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[11px] text-[#6c6656]">
          口座評価額
          <input
            type="number"
            value={accountValue}
            onChange={(e) => setAccountValue(e.target.value)}
            placeholder="例: 1000000"
            className={inputBase}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-[#6c6656]">
          許容リスク(口座に対する%)
          <input
            type="number"
            step="0.5"
            value={riskPercent}
            onChange={(e) => setRiskPercent(e.target.value)}
            className={inputBase}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-[#6c6656]">
          リスクリワード比(利確目標)
          <input
            type="number"
            step="0.5"
            value={rewardMultiple}
            onChange={(e) => setRewardMultiple(e.target.value)}
            className={inputBase}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-[#6c6656]">
          エントリー価格
          <input type="number" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} className={inputBase} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-[#6c6656]">
          損切りライン
          <input type="number" value={stopPrice} onChange={(e) => setStopPrice(e.target.value)} className={inputBase} />
        </label>
      </div>

      {result ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#e2dfd2] pt-3 sm:grid-cols-4">
            <div>
              <div className="text-[10.5px] text-[#a39d8c]">最大株数</div>
              <div className="font-mono text-[15px] font-extrabold text-[#1c1b18]">{result.maxShares.toLocaleString()}株</div>
            </div>
            <div>
              <div className="text-[10.5px] text-[#a39d8c]">ポジション評価額</div>
              <div className="font-mono text-[15px] font-extrabold text-[#1c1b18]">{fmt(result.positionValue)}</div>
              <div className="text-[10.5px] text-[#6c6656]">口座の{result.positionPercentOfAccount}%</div>
            </div>
            <div>
              <div className="text-[10.5px] text-[#a39d8c]">損切り幅</div>
              <div className="font-mono text-[15px] font-extrabold text-[#2f6fb0]">-{result.stopLossPercent}%</div>
              <div className="text-[10.5px] text-[#6c6656]">1株あたり{fmt(result.riskPerShare)}</div>
            </div>
            <div>
              <div className="text-[10.5px] text-[#a39d8c]">最大損失額</div>
              <div className="font-mono text-[15px] font-extrabold text-[#2f6fb0]">{fmt(result.totalRiskAmount)}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[#e2dfd2] pt-3 sm:grid-cols-4">
            <div>
              <div className="text-[10.5px] text-[#a39d8c]">利確ライン</div>
              <div className="font-mono text-[15px] font-extrabold text-[#c0392b]">{fmt(result.targetPrice)}</div>
              <div className="text-[10.5px] text-[#6c6656]">+{result.takeProfitPercent}%</div>
            </div>
            <div>
              <div className="text-[10.5px] text-[#a39d8c]">想定利益額</div>
              <div className="font-mono text-[15px] font-extrabold text-[#c0392b]">{fmt(result.potentialGainTotal)}</div>
            </div>
            <div>
              <div className="text-[10.5px] text-[#a39d8c]">リスクリワード比</div>
              <div className="font-mono text-[15px] font-extrabold text-[#1c1b18]">1 : {Number(rewardMultiple).toFixed(1)}</div>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-3 border-t border-[#e2dfd2] pt-3 text-[11.5px] text-[#a39d8c]">
          口座評価額・エントリー価格・損切りライン(エントリーより低い価格)を入力してください。
        </p>
      )}
      <p className="mt-2 text-[10.5px] leading-relaxed text-[#a39d8c]">
        「1トレードあたり口座の1〜2%までしかリスクを取らない」という考え方に基づく計算です。利確ラインは損切り幅に対するリスクリワード比から逆算した目安で、必ず届く価格ではありません。買いポジション(ロング)前提で、空売りには対応していません。
      </p>
    </div>
  );
}
