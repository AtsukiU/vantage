"use client";

import { useEffect, useState } from "react";
import { GlassPageShell } from "../GlassPageShell";
import { StockSearchBar } from "../stock/StockSearchBar";
import type { StockMetrics } from "@/lib/stockMetrics";
import { GLASS_CARD, GLASS_GOOD } from "@/lib/glassStyles";

interface Slot {
  symbol: string;
  name: string;
}

const MAX_SLOTS = 3;

interface RowSpec {
  key: keyof StockMetrics;
  label: string;
  higherIsBetter: boolean;
  format: (v: number, m: StockMetrics) => string;
}

const currencyPrefix = (m: StockMetrics) => (m.currency === "JPY" ? "¥" : m.currency === "USD" ? "$" : "");
const fmtCurrency = (v: number, m: StockMetrics) =>
  `${currencyPrefix(m)}${v.toLocaleString("ja-JP", { maximumFractionDigits: m.currency === "JPY" ? 0 : 2 })}`;

const ROWS: RowSpec[] = [
  { key: "price", label: "現在値", higherIsBetter: false, format: fmtCurrency },
  { key: "per", label: "PER(株価収益率)", higherIsBetter: false, format: (v) => `${v.toFixed(1)}倍` },
  { key: "pbr", label: "PBR(株価純資産倍率)", higherIsBetter: false, format: (v) => `${v.toFixed(1)}倍` },
  { key: "roe", label: "ROE(自己資本利益率)", higherIsBetter: true, format: (v) => `${v.toFixed(1)}%` },
  { key: "equityRatio", label: "自己資本比率", higherIsBetter: true, format: (v) => `${v.toFixed(0)}%` },
  { key: "operatingMargin", label: "営業利益率", higherIsBetter: true, format: (v) => `${v.toFixed(1)}%` },
  { key: "revenueGrowth", label: "売上成長率", higherIsBetter: true, format: (v) => `${v.toFixed(1)}%` },
  { key: "earningsGrowth", label: "利益成長率", higherIsBetter: true, format: (v) => `${v.toFixed(1)}%` },
  { key: "dividendYield", label: "配当利回り", higherIsBetter: true, format: (v) => `${v.toFixed(1)}%` },
  { key: "dividendGrowthYears", label: "増配年数", higherIsBetter: true, format: (v) => `${v}年` },
  { key: "debtToEquity", label: "負債比率", higherIsBetter: false, format: (v) => `${v.toFixed(0)}%` },
  { key: "grahamNumber", label: "グレアムナンバー", higherIsBetter: false, format: fmtCurrency },
  { key: "targetMeanPrice", label: "アナリスト目標株価", higherIsBetter: false, format: fmtCurrency },
  { key: "marketCap", label: "時価総額", higherIsBetter: false, format: (v, m) => (v >= 1e12 ? `${currencyPrefix(m)}${(v / 1e12).toFixed(1)}兆` : `${currencyPrefix(m)}${(v / 1e8).toFixed(0)}億`) },
];

export function CompareTab({
  hidden,
  onOpenDetail,
}: {
  hidden: boolean;
  onOpenDetail: (symbol: string, name: string) => void;
}) {
  const [slots, setSlots] = useState<(Slot | null)[]>([null, null]);
  const [metricsBySymbol, setMetricsBySymbol] = useState<Map<string, StockMetrics>>(new Map());
  const [loading, setLoading] = useState(false);

  const activeSymbols = slots.filter((s): s is Slot => s != null).map((s) => s.symbol);
  const activeSymbolsKey = activeSymbols.join(",");

  useEffect(() => {
    if (activeSymbols.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 選択解除時に比較結果をリセット
      setMetricsBySymbol(new Map());
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(
      activeSymbols.map(async (symbol) => {
        try {
          const res = await fetch(`/api/stock/${encodeURIComponent(symbol)}/metrics`, { cache: "no-store" });
          const json = await res.json();
          return res.ok && json.metrics ? ([symbol, json.metrics as StockMetrics] as const) : null;
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const next = new Map<string, StockMetrics>();
      for (const r of results) {
        if (r) next.set(r[0], r[1]);
      }
      setMetricsBySymbol(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbolsKey]);

  function setSlot(index: number, slot: Slot | null) {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = slot;
      return next;
    });
  }

  function addSlot() {
    if (slots.length >= MAX_SLOTS) return;
    setSlots((prev) => [...prev, null]);
  }

  const readyMetrics = slots.map((s) => (s ? metricsBySymbol.get(s.symbol) ?? null : null));
  const readyCount = readyMetrics.filter(Boolean).length;

  return (
    <section hidden={hidden} className="h-full">
      <GlassPageShell>
        <div className={`${GLASS_CARD} mb-4`}>
          <h2 className="mb-3 text-[13px] font-extrabold text-[var(--foreground)]">
            銘柄比較 <span className="font-mono font-normal text-[var(--text-secondary)]">(最大{MAX_SLOTS}銘柄)</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {slots.map((slot, i) => (
              <div key={i}>
                {slot ? (
                  <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--fill-subtle)] px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-semibold text-[var(--foreground)]">{slot.name}</div>
                      <div className="font-mono text-[10.5px] text-[var(--text-secondary)]">{slot.symbol}</div>
                    </div>
                    <button onClick={() => setSlot(i, null)} className="ml-2 shrink-0 text-[var(--text-muted)] hover:text-red-600">
                      ✕
                    </button>
                  </div>
                ) : (
                  <StockSearchBar onSelect={(symbol, name) => setSlot(i, { symbol, name })} />
                )}
              </div>
            ))}
            {slots.length < MAX_SLOTS && (
              <button
                onClick={addSlot}
                className="rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-2 text-[12.5px] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
              >
                + 比較銘柄を追加
              </button>
            )}
          </div>
        </div>

        {readyCount < 2 ? (
          <div className="rounded-[18px] border border-dashed border-[var(--border-subtle)] bg-white/60 p-10 text-center text-[13px] text-[var(--text-secondary)]">
            {loading ? "取得中…" : "2銘柄以上を選択すると比較できます"}
          </div>
        ) : (
          <div className={`${GLASS_CARD} overflow-x-auto p-0`}>
            <table className="w-full min-w-[480px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-left text-[11px] text-[var(--text-secondary)]">
                  <th className="px-4 py-2.5 font-medium">指標</th>
                  {slots.map((slot, i) => {
                    const m = readyMetrics[i];
                    if (!slot || !m) return null;
                    return (
                      <th key={slot.symbol} className="px-3 py-2.5 text-right font-medium">
                        <button
                          onClick={() => onOpenDetail(slot.symbol, m.name ?? slot.symbol)}
                          className="text-[var(--foreground)] hover:text-[var(--accent)] hover:underline"
                        >
                          {m.name ?? slot.symbol}
                        </button>
                        <div className="font-mono font-normal text-[var(--text-muted)]">{slot.symbol}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => {
                  const values = readyMetrics.map((m) => (m ? (m[row.key] as number | null) : null));
                  const numericValues = values.filter((v): v is number => v != null);
                  const best =
                    numericValues.length >= 2
                      ? row.higherIsBetter
                        ? Math.max(...numericValues)
                        : Math.min(...numericValues)
                      : null;

                  return (
                    <tr key={row.key} className="border-b border-[var(--border-faint)] last:border-0">
                      <td className="px-4 py-2.5 text-[var(--text-secondary)]">{row.label}</td>
                      {slots.map((slot, i) => {
                        const m = readyMetrics[i];
                        if (!slot || !m) return null;
                        const v = values[i];
                        return (
                          <td
                            key={slot.symbol}
                            className="px-3 py-2.5 text-right font-mono font-semibold"
                            style={{ color: v != null && best != null && v === best ? GLASS_GOOD : "var(--foreground)" }}
                          >
                            {v != null ? row.format(v, m) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          緑色は比較銘柄の中で最も良い値であることを示します(値が低いほど良い指標は最小値、高いほど良い指標は最大値)。
        </p>
      </GlassPageShell>
    </section>
  );
}
