"use client";

import { useEffect, useState } from "react";
import { GLASS_CARD } from "@/lib/glassStyles";
import type { FxOutlook, FxPhase } from "@/lib/fxOutlook";
import { ArrowLeftRight } from "lucide-react";

const REFRESH_MS = 5 * 60 * 1000;

// 白文字を乗せる前提の固定バッジ色なので、ダークモードでも変えない
// (TICKER_CATEGORY_COLOR・HEALTH_COLORと同じ理由)。
const PHASE_COLOR: Record<FxPhase, string> = {
  円安進行中: "#c0392b",
  円安基調: "#c0392b",
  中立: "#6c6656",
  円高基調: "#2f6fb0",
  円高進行中: "#2f6fb0",
};

// 「新規に買うなら日本株(輸出関連)と米国株のどちらが為替の観点でやや有利か」を
// 円安/円高の局面から機械的に読むための、参考情報カード(個別の売買推奨とは独立)。
export function FxOutlookCard() {
  const [outlook, setOutlook] = useState<FxOutlook | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/fx-outlook", { cache: "no-store" });
        if (!res.ok) throw new Error("bad status");
        const json = await res.json();
        if (!cancelled) {
          setOutlook(json);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (error) return null; // 為替データが取れない時は静かに非表示にする(本体の助言機能には影響しない)

  if (!outlook) {
    return (
      <div className={`${GLASS_CARD} mb-4`}>
        <div className="flex items-center gap-2">
          <ArrowLeftRight size={15} strokeWidth={2.25} className="text-[var(--accent)]" />
          <h2 className="text-[13px] font-extrabold text-[var(--foreground)]">為替観測(円安/円高)</h2>
        </div>
        <p className="mt-2 text-xs text-[var(--text-secondary)]">読み込み中…</p>
      </div>
    );
  }

  const up = outlook.changePercent >= 0;
  const color = PHASE_COLOR[outlook.phase];

  return (
    <div className={`${GLASS_CARD} mb-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ArrowLeftRight size={15} strokeWidth={2.25} className="text-[var(--accent)]" />
          <h2 className="text-[13px] font-extrabold text-[var(--foreground)]">為替観測(円安/円高)</h2>
        </div>
        <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: color }}>
          {outlook.phase}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-baseline gap-2">
        <span className="text-[22px] font-extrabold tabular-nums text-[var(--foreground)]">¥{outlook.usdJpy.toFixed(2)}</span>
        <span className="text-xs text-[var(--text-secondary)]">/ドル</span>
        <span className={`text-xs font-semibold tabular-nums ${up ? "text-[var(--price-up)]" : "text-[var(--price-down)]"}`}>
          {up ? "▲" : "▼"} {Math.abs(outlook.changePercent).toFixed(2)}%(前日比)
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-secondary)]">
        {outlook.vsMa50Pct != null && (
          <span>
            50日線比 {outlook.vsMa50Pct >= 0 ? "+" : ""}
            {outlook.vsMa50Pct.toFixed(1)}%
          </span>
        )}
        {outlook.vsMa200Pct != null && (
          <span>
            200日線比 {outlook.vsMa200Pct >= 0 ? "+" : ""}
            {outlook.vsMa200Pct.toFixed(1)}%
          </span>
        )}
        {outlook.roc20dPct != null && (
          <span>
            直近1か月 {outlook.roc20dPct >= 0 ? "+" : ""}
            {outlook.roc20dPct.toFixed(1)}%
          </span>
        )}
      </div>

      <div className="mt-3 rounded-[12px] bg-[var(--fill-subtle)] p-3">
        <p className="text-[12.5px] font-bold text-[var(--foreground)]">
          新規に買うなら: <span style={{ color }}>{outlook.lean}</span>
        </p>
        <ul className="mt-1.5 space-y-0.5 text-[11px] text-[var(--text-secondary)]">
          {outlook.reasoning.map((r) => (
            <li key={r}>・{r}</li>
          ))}
        </ul>
      </div>
      <p className="mt-2 text-[10.5px] text-[var(--text-muted)]">為替の方向性だけを見た参考情報です。個別銘柄の業績・バリュエーションと合わせて判断してください。</p>
    </div>
  );
}
