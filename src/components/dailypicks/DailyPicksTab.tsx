"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GlassPageShell } from "../GlassPageShell";
import type { DailyScreenState, DailyScreenEntry, ScreenMarket } from "@/lib/dailyScreenStore";
import { computeOverallScore } from "@/lib/dailyPickOverall";
import { GLASS_CARD, GLASS_BTN_GHOST, GLASS_EXCELLENT, GLASS_GOOD, GLASS_UP, GLASS_DOWN, GLASS_TEXT2 } from "@/lib/glassStyles";
import { OverallScoreBadge } from "../OverallScoreBadge";
import { Gavel } from "lucide-react";

const POLL_MS = 4000;

type SortableKey = "price" | "dayChangePercent" | "overallScore" | "rsPercentile";
type ViewKey = ScreenMarket | "all";

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

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "jp", label: "日本株" },
  { key: "us", label: "米国株" },
  { key: "all", label: "全体" },
];

const MARKET_TAG: Record<ScreenMarket, { label: string; color: string }> = {
  jp: { label: "日本", color: "var(--price-down)" },
  us: { label: "米国", color: "#8f6ea3" },
};

interface Row extends DailyScreenEntry {
  overallScore: number; // 0-100。ミネルヴィニ/CANSLIM/財務健全性/委員会の4スコアの単純平均
  overallGrade: string;
  sourceMarket: ScreenMarket;
}

// 運用アドバイザーの「総合スコア型(投資委員会)」ペルソナの採用基準(personaRules.ts)と
// 揃えた閾値: 投資委員会5役のうち60%以上が賛成している銘柄を「委員会推奨」として扱う。
function isCommitteeRecommended(e: DailyScreenEntry): boolean {
  return e.committeeAgree != null && e.committeeTotal != null && e.committeeTotal > 0 && e.committeeAgree / e.committeeTotal >= 0.6;
}

function rsColor(rsPercentile: number | null): string {
  if (rsPercentile == null) return GLASS_TEXT2;
  if (rsPercentile >= 90) return GLASS_EXCELLENT;
  if (rsPercentile >= 70) return GLASS_GOOD;
  return GLASS_TEXT2;
}

function toRows(results: DailyScreenEntry[], market: ScreenMarket): Row[] {
  return results.map((e) => {
    const { score, grade } = computeOverallScore(e);
    return { ...e, overallScore: score, overallGrade: grade, sourceMarket: market };
  });
}

// 「全体(日本株+米国株)」表示用: それぞれの市場のスキャン結果を合算した上で、RSパーセンタイルを
// 合算後の母集団全体で計算し直す(各市場のrsPercentileはその市場単独のスキャン対象内での
// 順位のため、そのまま混ぜるとJP/USで基準が揃わない。dailyScreenStore.tsのassignRsPercentilesと
// 同じロジックをクライアント側で合算データに対して再適用する)。
function combineWithRecomputedRs(jpResults: DailyScreenEntry[], usResults: DailyScreenEntry[]): Row[] {
  const combined: Row[] = [...toRows(jpResults, "jp"), ...toRows(usResults, "us")];
  const withRs = combined.filter((e): e is Row & { relativeStrengthPct: number } => e.relativeStrengthPct != null);
  const sorted = [...withRs].sort((a, b) => a.relativeStrengthPct - b.relativeStrengthPct);
  const n = sorted.length;
  sorted.forEach((e, rank) => {
    e.rsPercentile = n <= 1 ? 100 : Math.round((rank / (n - 1)) * 100);
  });
  return combined;
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

function fmtFinished(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
}

export function DailyPicksTab({
  hidden,
  onOpenDetail,
}: {
  hidden: boolean;
  onOpenDetail: (symbol: string, name: string) => void;
}) {
  const [view, setView] = useState<ViewKey>("jp");
  const [jpState, setJpState] = useState<DailyScreenState | null>(null);
  const [usState, setUsState] = useState<DailyScreenState | null>(null);
  const [showCount, setShowCount] = useState(30);
  const [columnSort, setColumnSort] = useState<{ key: SortableKey; dir: 1 | -1 } | null>(null);
  const [rsFilter, setRsFilter] = useState(0);
  const pollRef = useRef<number | null>(null);

  async function fetchBoth() {
    try {
      const [jpRes, usRes] = await Promise.all([
        fetch("/api/daily-screen/status?market=jp", { cache: "no-store" }),
        fetch("/api/daily-screen/status?market=us", { cache: "no-store" }),
      ]);
      const [jp, us] = await Promise.all([jpRes.json(), usRes.json()]);
      setJpState(jp);
      setUsState(us);
      return { jp, us } as { jp: DailyScreenState; us: DailyScreenState };
    } catch {
      return null;
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- タブを開いた時に両市場の状況を取得
    fetchBoth();
    return () => {
      if (pollRef.current != null) window.clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 表示切替時にフィルタ・ソートをリセット
    setShowCount(30);
    setColumnSort(null);
    setRsFilter(0);
  }, [view]);

  const anyRunning = jpState?.status === "running" || usState?.status === "running";
  useEffect(() => {
    if (anyRunning) {
      pollRef.current = window.setInterval(fetchBoth, POLL_MS);
    } else if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current != null) window.clearInterval(pollRef.current);
    };
  }, [anyRunning]);

  function toggleColumnSort(key: SortableKey) {
    setColumnSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: -1 };
      if (prev.dir === -1) return { key, dir: 1 };
      return null;
    });
  }

  const singleState = view === "jp" ? jpState : view === "us" ? usState : null;

  const rows: Row[] = useMemo(() => {
    if (view === "all") {
      const jpResults = jpState?.status === "done" ? jpState.results : [];
      const usResults = usState?.status === "done" ? usState.results : [];
      return combineWithRecomputedRs(jpResults, usResults);
    }
    if (singleState?.status === "done") return toRows(singleState.results, view);
    return [];
  }, [view, jpState, usState, singleState]);

  const filtered = rsFilter > 0 ? rows.filter((r) => r.rsPercentile != null && r.rsPercentile >= rsFilter) : rows;
  const sorted = columnSort ? sortByColumn(filtered, columnSort.key, columnSort.dir) : defaultSort(filtered);

  const hasAnyRows = view === "all" ? rows.length > 0 : singleState?.status === "done";

  return (
    <section hidden={hidden} className="h-full">
      <GlassPageShell>
        <div className={`${GLASS_CARD} mb-3 sm:mb-4`}>
          <div>
            <h2 className="text-[12.5px] font-extrabold text-[var(--foreground)]">本日の注目銘柄</h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {view === "all"
                ? "東証プライム市場(約1,550銘柄)+S&P500構成銘柄(約500銘柄)を合算し、ミネルヴィニ・CANSLIM・財務健全性・投資委員会の合議スコアから総合評価を出します。"
                : `${MARKETS.find((m) => m.key === view)!.universe}をフルスキャンし、ミネルヴィニ・CANSLIM・財務健全性・投資委員会の合議スコアから総合評価を出します。`}
            </p>
          </div>

          <div className="mt-3 flex w-fit gap-1 rounded-full bg-[var(--fill-pill)] p-1">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  view === v.key ? "bg-[var(--surface)] text-[var(--accent)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--foreground)]"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {view !== "all" && (
            <>
              {!singleState && <div className="mt-3 text-xs text-[var(--text-secondary)]">状態を確認中…</div>}

              {singleState?.status === "idle" && (
                <p className="mt-3 rounded-lg bg-[var(--fill-pill)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
                  まだ本日分のスキャンが実行されていません。ニュースタブ先頭の「スキャン開始」から実行してください。
                </p>
              )}

              {singleState?.status === "running" && (
                <div className="mt-3">
                  <div className="mb-1.5 flex justify-between text-xs text-[var(--text-secondary)]">
                    <span>スキャン中… {singleState.progress.done} / {singleState.progress.total}銘柄</span>
                    <span>{singleState.progress.total > 0 ? Math.round((singleState.progress.done / singleState.progress.total) * 100) : 0}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--fill-pill)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-all"
                      style={{ width: `${singleState.progress.total > 0 ? (singleState.progress.done / singleState.progress.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-[var(--text-muted)]">このページを開いたままでも、他のタブに移動しても処理は続きます。</p>
                </div>
              )}

              {singleState?.status === "error" && (
                <div className="mt-3">
                  <p className="rounded-lg bg-[var(--price-up)]/10 px-3 py-2 text-[12.5px] text-[var(--price-up)]">{singleState.error ?? "スキャンに失敗しました"}</p>
                  <p className="mt-2 text-[11px] text-[var(--text-secondary)]">ニュースタブ先頭の「再スキャン」からやり直してください。</p>
                </div>
              )}

              {singleState?.status === "done" && (
                <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                  最終更新: {fmtFinished(singleState.finishedAt)}({singleState.results.length}銘柄取得)
                </p>
              )}
            </>
          )}

          {view === "all" && (
            <div className="mt-3 space-y-1.5">
              {MARKETS.map((m) => {
                const s = m.key === "jp" ? jpState : usState;
                if (!s) return <p key={m.key} className="text-xs text-[var(--text-secondary)]">{m.label}: 状態を確認中…</p>;
                if (s.status === "idle")
                  return <p key={m.key} className="text-xs text-[var(--text-secondary)]">{m.label}: 未スキャン(ニュースタブ先頭からスキャン開始)</p>;
                if (s.status === "running")
                  return (
                    <p key={m.key} className="text-xs text-[var(--accent)]">
                      {m.label}: スキャン中 {s.progress.done}/{s.progress.total}銘柄
                    </p>
                  );
                if (s.status === "error") return <p key={m.key} className="text-xs text-[var(--price-up)]">{m.label}: スキャンに失敗しました</p>;
                return (
                  <p key={m.key} className="text-xs text-[var(--text-muted)]">
                    {m.label}: 更新済み({s.results.length}銘柄、最終更新 {fmtFinished(s.finishedAt)})
                  </p>
                );
              })}
              {jpState?.status !== "done" || usState?.status !== "done" ? (
                <p className="text-[11px] text-[var(--text-muted)]">※片方の市場が未スキャンの間は、更新済みの市場分だけで表示します。</p>
              ) : null}
            </div>
          )}
        </div>

        {hasAnyRows && rows.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-[var(--text-secondary)]">相対力(RS)フィルタ:</span>
            <div className="flex w-fit gap-1 rounded-full bg-[var(--fill-pill)] p-1">
              {RS_FILTERS.map((f) => (
                <button
                  key={f.threshold}
                  onClick={() => setRsFilter(f.threshold)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                    rsFilter === f.threshold ? "bg-[var(--surface)] text-[var(--accent)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasAnyRows && rows.length > 0 && sorted.length === 0 && (
          <div className={`${GLASS_CARD} text-center text-xs text-[var(--text-secondary)]`}>
            この条件に一致する銘柄はありません。フィルタを緩めてください。
          </div>
        )}

        {hasAnyRows && sorted.length > 0 && (
          <>
            {/* スマホ幅では横スクロール前提の表ではなく、1銘柄1カードの縦積みリストにする
                (価格・総合評価に絞り、RSなど優先度の低い情報は省いて画面内に収める)。 */}
            <div className={`${GLASS_CARD} divide-y divide-[var(--border-faint)] overflow-hidden p-0 md:hidden`}>
              {sorted.slice(0, showCount).map((r) => {
                const up = (r.dayChangePercent ?? 0) >= 0;
                const currencyPrefix = r.currency === "JPY" ? "¥" : r.currency === "USD" ? "$" : "";
                return (
                  <button
                    key={`m-${r.sourceMarket}-${r.ticker}`}
                    onClick={() => onOpenDetail(r.ticker, r.name ?? r.ticker)}
                    className="flex w-full flex-col gap-1.5 px-4 py-3 text-left transition hover:bg-[var(--fill-subtle)]"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      {view === "all" && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white"
                          style={{ background: MARKET_TAG[r.sourceMarket].color }}
                        >
                          {MARKET_TAG[r.sourceMarket].label}
                        </span>
                      )}
                      <span className="font-semibold text-[var(--foreground)]">{r.name ?? r.ticker}</span>
                    </div>
                    <div className="font-mono text-[11px] text-[var(--text-secondary)]">{r.ticker}</div>
                    <div className="flex items-center justify-between gap-2 text-[15px] tabular-nums">
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--foreground)]">
                          {r.price != null ? `${currencyPrefix}${r.price.toLocaleString("ja-JP")}` : "—"}
                        </span>
                        <span className="font-semibold" style={{ color: r.dayChangePercent == null ? GLASS_TEXT2 : up ? GLASS_UP : GLASS_DOWN }}>
                          {r.dayChangePercent != null ? `${up ? "▲" : "▼"} ${r.dayChangePercent.toFixed(2)}%` : "—"}
                        </span>
                      </div>
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
                    </div>
                    {isCommitteeRecommended(r) && (
                      <span
                        className="inline-flex w-fit shrink-0 items-center gap-0.5 rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[9px] font-bold text-[var(--accent-hover)]"
                        title={`投資委員会 ${r.committeeAgree}/${r.committeeTotal}役が賛成(基準60%以上)`}
                      >
                        <Gavel size={9} strokeWidth={2.5} />
                        委員会推奨 {r.committeeAgree}/{r.committeeTotal}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className={`${GLASS_CARD} hidden overflow-x-auto p-0 md:block`}>
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-left text-[11px] text-[var(--text-secondary)]">
                    <th className="px-4 py-2.5 font-medium">銘柄</th>
                    {COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => toggleColumnSort(col.key)}
                        className="cursor-pointer select-none px-3 py-2.5 text-right font-medium hover:text-[var(--accent)]"
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
                      <tr key={`${r.sourceMarket}-${r.ticker}`} className="border-b border-[var(--border-faint)] transition hover:bg-[var(--fill-subtle)] last:border-0">
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {view === "all" && (
                              <span
                                className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white"
                                style={{ background: MARKET_TAG[r.sourceMarket].color }}
                              >
                                {MARKET_TAG[r.sourceMarket].label}
                              </span>
                            )}
                            <button
                              onClick={() => onOpenDetail(r.ticker, r.name ?? r.ticker)}
                              className="text-left font-semibold text-[var(--foreground)] hover:text-[var(--accent)] hover:underline"
                            >
                              {r.name ?? r.ticker}
                            </button>
                            {isCommitteeRecommended(r) && (
                              <span
                                className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[9px] font-bold text-[var(--accent-hover)]"
                                title={`投資委員会 ${r.committeeAgree}/${r.committeeTotal}役が賛成(基準60%以上)`}
                              >
                                <Gavel size={9} strokeWidth={2.5} />
                                委員会推奨 {r.committeeAgree}/{r.committeeTotal}
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[11px] text-[var(--text-secondary)]">{r.ticker}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[15px] text-[var(--foreground)]">
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

        <details className="mt-3 text-xs text-[var(--text-muted)]">
          <summary className="cursor-pointer select-none">評価・RSの計算方法について</summary>
          <p className="mt-1 leading-relaxed">
            総合評価はミネルヴィニ/CANSLIM/財務健全性/委員会合議スコアの単純平均(0-100、S/A/B/C/Dの5段階)です。ホバーすると内訳が見られます。銘柄名の「委員会推奨」バッジは、投資委員会5役(ファンダメンタル/テクニカル/センチメント/リスク管理/マクロ)のうち60%以上が賛成している銘柄に付きます。RSはベンチマークに対する6ヶ月相対力を、その日のスキャン対象全体の中でパーセンタイル順位に変換したもの(0-100、高いほど強い)です。「全体」表示ではRSを日本株・米国株を合わせた母集団で計算し直しています。各スコア自体も簡易ルールベースの計算です。投資助言ではなく、参考情報としてご利用ください。
          </p>
        </details>
      </GlassPageShell>
    </section>
  );
}
