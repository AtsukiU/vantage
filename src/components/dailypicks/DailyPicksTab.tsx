"use client";

import { useEffect, useRef, useState } from "react";
import { GlassPageShell } from "../GlassPageShell";
import type { DailyScreenState, DailyScreenEntry, ScreenMarket } from "@/lib/dailyScreenStore";
import { computeOverallScore } from "@/lib/dailyPickOverall";
import { GLASS_CARD, GLASS_BTN_GHOST, GLASS_EXCELLENT, GLASS_GOOD, GLASS_UP, GLASS_DOWN, GLASS_TEXT2 } from "@/lib/glassStyles";
import { OverallScoreBadge } from "../OverallScoreBadge";

const POLL_MS = 4000;

type SortableKey = "price" | "dayChangePercent" | "overallScore" | "rsPercentile";

const COLUMNS: { key: SortableKey; label: string }[] = [
  { key: "price", label: "価格" },
  { key: "dayChangePercent", label: "前日比" },
  { key: "overallScore", label: "総合評価" },
  { key: "rsPercentile", label: "RS" },
];

const RS_FILTERS: { threshold: number; label: string }[] = [
  { threshold: 0, label: "すべて" },
  { threshold: 50, label: "RS上位50%" },
  { threshold: 70, label: "RS上位30%" },
  { threshold: 90, label: "RS上位10%" },
];

const MARKETS: { key: ScreenMarket; label: string; universe: string }[] = [
  { key: "jp", label: "日本株", universe: "東証プライム市場(約1,550銘柄)" },
  { key: "us", label: "米国株", universe: "S&P500構成銘柄(約500銘柄)" },
];

interface Row extends DailyScreenEntry {
  overallScore: number; // 0-100。ミネルヴィニ/CANSLIM/財務健全性/委員会の4スコアの単純平均
  overallGrade: string;
}

function rsColor(rsPercentile: number | null): string {
  if (rsPercentile == null) return GLASS_TEXT2;
  if (rsPercentile >= 90) return GLASS_EXCELLENT;
  if (rsPercentile >= 70) return GLASS_GOOD;
  return GLASS_TEXT2;
}

function toRows(results: DailyScreenEntry[]): Row[] {
  return results.map((e) => {
    const { score, grade } = computeOverallScore(e);
    return { ...e, overallScore: score, overallGrade: grade };
  });
}

// デフォルト(未ソート時)は総合評価の高い順で並べる。
function defaultSort(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => b.overallScore - a.overallScore);
}

function sortByColumn(rows: Row[], key: SortableKey, dir: 1 | -1): Row[] {
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * dir;
  });
}

export function DailyPicksTab({
  hidden,
  onOpenDetail,
}: {
  hidden: boolean;
  onOpenDetail: (symbol: string, name: string) => void;
}) {
  const [market, setMarket] = useState<ScreenMarket>("jp");
  const [state, setState] = useState<DailyScreenState | null>(null);
  const [showCount, setShowCount] = useState(30);
  const [columnSort, setColumnSort] = useState<{ key: SortableKey; dir: 1 | -1 } | null>(null);
  const [rsFilter, setRsFilter] = useState(0);
  const pollRef = useRef<number | null>(null);

  async function fetchStatus(m: ScreenMarket) {
    try {
      const res = await fetch(`/api/daily-screen/status?market=${m}`, { cache: "no-store" });
      const json = await res.json();
      setState(json);
      return json as DailyScreenState;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 市場切替時に現在のスキャン状況を同期
    setState(null);
    fetchStatus(market);
    setShowCount(30);
    setColumnSort(null);
    setRsFilter(0);
    return () => {
      if (pollRef.current != null) window.clearInterval(pollRef.current);
    };
  }, [market]);

  useEffect(() => {
    if (state?.status === "running") {
      pollRef.current = window.setInterval(() => fetchStatus(market), POLL_MS);
    } else if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current != null) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status]);

  function toggleColumnSort(key: SortableKey) {
    setColumnSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: -1 };
      if (prev.dir === -1) return { key, dir: 1 };
      return null;
    });
  }

  const rows = state ? toRows(state.results) : [];
  const filtered = rsFilter > 0 ? rows.filter((r) => r.rsPercentile != null && r.rsPercentile >= rsFilter) : rows;
  const sorted = columnSort ? sortByColumn(filtered, columnSort.key, columnSort.dir) : defaultSort(filtered);
  const finishedLabel = state?.finishedAt
    ? new Date(state.finishedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  const marketInfo = MARKETS.find((m) => m.key === market)!;

  return (
    <section hidden={hidden}>
      <GlassPageShell maxWidth="max-w-5xl">
        <div className={`${GLASS_CARD} mb-4`}>
          <div>
            <h2 className="text-[13px] font-extrabold text-[#1c1b18]">本日の注目銘柄</h2>
            <p className="mt-1 text-xs text-[#6c6656]">
              {marketInfo.universe}をフルスキャンし、ミネルヴィニ・CANSLIM・財務健全性・投資委員会の合議スコアから総合評価を出します。
            </p>
          </div>

          <div className="mt-3 flex w-fit gap-1 rounded-full bg-[#f0efe6] p-1">
            {MARKETS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMarket(m.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  market === m.key ? "bg-white text-[#c9962f] shadow-sm" : "text-[#6c6656] hover:text-[#1c1b18]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {!state && <div className="mt-3 text-xs text-[#6c6656]">状態を確認中…</div>}

          {state?.status === "idle" && (
            <p className="mt-3 rounded-lg bg-[#f0efe6] px-3 py-2 text-[11.5px] text-[#6c6656]">
              まだ本日分のスキャンが実行されていません。ニュースタブ先頭の「スキャン開始」から実行してください。
            </p>
          )}

          {state?.status === "running" && (
            <div className="mt-3">
              <div className="mb-1.5 flex justify-between text-xs text-[#6c6656]">
                <span>スキャン中… {state.progress.done} / {state.progress.total}銘柄</span>
                <span>{state.progress.total > 0 ? Math.round((state.progress.done / state.progress.total) * 100) : 0}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#f0efe6]">
                <div
                  className="h-full rounded-full bg-[#c9962f] transition-all"
                  style={{ width: `${state.progress.total > 0 ? (state.progress.done / state.progress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-[#a39d8c]">このページを開いたままでも、他のタブに移動しても処理は続きます。</p>
            </div>
          )}

          {state?.status === "error" && (
            <div className="mt-3">
              <p className="rounded-lg bg-[#c0392b]/10 px-3 py-2 text-[12px] text-[#c0392b]">{state.error ?? "スキャンに失敗しました"}</p>
              <p className="mt-2 text-[11.5px] text-[#6c6656]">ニュースタブ先頭の「再スキャン」からやり直してください。</p>
            </div>
          )}

          {state?.status === "done" && (
            <p className="mt-2 text-[11px] text-[#a39d8c]">
              最終更新: {finishedLabel}({state.results.length}銘柄取得)
            </p>
          )}
        </div>

        {state?.status === "done" && rows.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-[#6c6656]">相対力(RS)フィルタ:</span>
            <div className="flex w-fit gap-1 rounded-full bg-[#f0efe6] p-1">
              {RS_FILTERS.map((f) => (
                <button
                  key={f.threshold}
                  onClick={() => setRsFilter(f.threshold)}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                    rsFilter === f.threshold ? "bg-white text-[#c9962f] shadow-sm" : "text-[#6c6656] hover:text-[#1c1b18]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {state?.status === "done" && rows.length > 0 && sorted.length === 0 && (
          <div className={`${GLASS_CARD} text-center text-xs text-[#6c6656]`}>
            この条件に一致する銘柄はありません。フィルタを緩めてください。
          </div>
        )}

        {state?.status === "done" && sorted.length > 0 && (
          <>
            <div className={`${GLASS_CARD} overflow-x-auto p-0`}>
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-[#e2dfd2] text-left text-[11px] text-[#6c6656]">
                    <th className="px-4 py-2.5 font-medium">銘柄</th>
                    {COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => toggleColumnSort(col.key)}
                        className="cursor-pointer select-none px-3 py-2.5 text-right font-medium hover:text-[#c9962f]"
                      >
                        {col.label}
                        {columnSort?.key === col.key && (columnSort.dir === -1 ? " ▼" : " ▲")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.slice(0, showCount).map((r) => {
                    const up = (r.dayChangePercent ?? 0) >= 0;
                    const currencyPrefix = r.currency === "JPY" ? "¥" : r.currency === "USD" ? "$" : "";
                    return (
                      <tr key={r.ticker} className="border-b border-[#efece2] transition hover:bg-[#f7f6f1] last:border-0">
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => onOpenDetail(r.ticker, r.name ?? r.ticker)}
                            className="text-left font-semibold text-[#1c1b18] hover:text-[#c9962f] hover:underline"
                          >
                            {r.name ?? r.ticker}
                          </button>
                          <div className="font-mono text-[11px] text-[#6c6656]">{r.ticker}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[15px] text-[#1c1b18]">
                          {r.price != null ? `${currencyPrefix}${r.price.toLocaleString("ja-JP")}` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[15px] font-semibold" style={{ color: r.dayChangePercent == null ? GLASS_TEXT2 : up ? GLASS_UP : GLASS_DOWN }}>
                          {r.dayChangePercent != null ? `${up ? "▲" : "▼"} ${r.dayChangePercent.toFixed(2)}%` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <OverallScoreBadge
                            score={r.overallScore}
                            grade={r.overallGrade}
                            breakdown={{
                              minerviniScore: r.minerviniScore,
                              canslimScore: r.canslimScore,
                              qualityScore: r.qualityScore,
                              qualityTotal: r.qualityTotal,
                              committeeAgree: r.committeeAgree,
                              committeeTotal: r.committeeTotal,
                              committeeRoles: r.committeeRoles,
                            }}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: rsColor(r.rsPercentile) }}>
                          {r.rsPercentile != null ? `${r.rsPercentile}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {showCount < sorted.length && (
              <div className="mt-3 flex justify-center">
                <button onClick={() => setShowCount((c) => c + 30)} className={GLASS_BTN_GHOST}>
                  もっと見る({sorted.length - showCount}銘柄)
                </button>
              </div>
            )}
          </>
        )}

        <p className="mt-3 text-xs text-[#a39d8c]">
          総合評価はミネルヴィニ/CANSLIM/財務健全性/委員会合議スコアの単純平均(0-100、S/A/B/C/Dの5段階)です。ホバーすると内訳が見られます。RSはベンチマークに対する6ヶ月相対力を、その日のスキャン対象全体の中でパーセンタイル順位に変換したもの(0-100、高いほど強い)です。各スコア自体も簡易ルールベースの計算です。投資助言ではなく、参考情報としてご利用ください。
        </p>
      </GlassPageShell>
    </section>
  );
}
