"use client";

import { useEffect, useState } from "react";
import { GlassPageShell } from "../GlassPageShell";
import { GLASS_CARD, GLASS_BTN_PRIMARY, GLASS_BTN_GHOST, GLASS_TEXT2 } from "@/lib/glassStyles";
import { PERSONA_DEFS, STARTING_CASH_JPY, type PersonaId, type PersonaAccount } from "@/lib/personaDefs";
import type { DailyScreenState } from "@/lib/dailyScreenStore";
import { loadPortfolio, loadCashJpy, saveCashJpy } from "@/lib/portfolioStore";
import { fetchMetricsBatch } from "@/lib/fetchMetricsBatch";
import { computePortfolioAdvice, type PersonaAdvice } from "@/lib/portfolioAdvice";
import type { FilterExplanation } from "@/lib/personaRules";
import { FxOutlookCard } from "./FxOutlookCard";
import { TrendBacktestCard } from "./TrendBacktestCard";
import { Users, TrendingDown, TrendingUp, ShieldCheck } from "lucide-react";

// 売り/買い推奨にマウスホバーした時だけ出す、判定条件の内訳ツールチップ。
// 親要素に `group relative` を付けて使う(Tailwindのgroup-hoverパターン)。
function DetailTooltip({ detail }: { detail: FilterExplanation[] }) {
  if (detail.length === 0) return null;
  return (
    <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 hidden w-60 rounded-lg bg-[#1c1b18] p-2.5 text-[11px] shadow-lg group-hover:block">
      {detail.map((d) => (
        <div key={d.label} className="flex items-center justify-between gap-2 py-0.5">
          <span className="flex items-center gap-1" style={{ color: d.pass ? "var(--status-good-soft)" : "var(--status-bad-soft)" }}>
            {d.pass ? "✓" : "✕"} {d.label}
          </span>
          <span className="text-right text-white/70">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

// 「運用アドバイザー」タブ: 銘柄ピックアップ・自分のポートフォリオに対する買い増し/売却の判断を、
// 7人の仮想アドバイザー(トレンド/総合スコア/バリュー/リスク管理/インカム/イベント警戒/統括マネージャー)にやって
// もらうための助言画面。メインは「本日の推奨アクション」(実際の保有銘柄に対する売り推奨・
// 新規の買い推奨+推奨株数、手元資金で今買えるかどうか)。「このルールに従い続けたらどうなるか」
// を検証したい場合のために、架空資金でのシミュレーション結果は下部の折りたたみセクションに
// 残している(実際の売買は一切行わない)。

const PERSONA_COLOR: Record<PersonaId, string> = {
  trend: "var(--accent)",
  committee: "var(--accent-strong)",
  value: "#6f5fa3",
  risk: "var(--price-down)",
  income: "#a9843b",
  event: "#8f6ea3",
  manager: "#1c3a5e",
};

const DISPLAY_ORDER: PersonaId[] = ["manager", "trend", "committee", "value", "risk", "income", "event"];

function fmtYen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

export function PersonasTab({
  hidden,
  onOpenDetail,
}: {
  hidden: boolean;
  onOpenDetail: (symbol: string, name: string) => void;
}) {
  const [scanReady, setScanReady] = useState<{ jp: boolean; us: boolean } | null>(null);
  const [advice, setAdvice] = useState<PersonaAdvice[] | null>(null);
  const [portfolioValueJpy, setPortfolioValueJpy] = useState(0);
  const [holdingCount, setHoldingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cashJpy, setCashJpy] = useState(0);
  const [cashInput, setCashInput] = useState("");
  const [editingCash, setEditingCash] = useState(false);

  async function loadAdvice() {
    setLoading(true);
    try {
      const [jpRes, usRes] = await Promise.all([
        fetch("/api/daily-screen/status?market=jp", { cache: "no-store" }),
        fetch("/api/daily-screen/status?market=us", { cache: "no-store" }),
      ]);
      const jpState: DailyScreenState = await jpRes.json();
      const usState: DailyScreenState = await usRes.json();
      const jpReady = jpState.status === "done";
      const usReady = usState.status === "done";
      setScanReady({ jp: jpReady, us: usReady });

      const combinedPool = [...(jpReady ? jpState.results : []), ...(usReady ? usState.results : [])];

      const holdings = await loadPortfolio();
      setHoldingCount(holdings.length);
      const cash = await loadCashJpy();
      setCashJpy(cash);
      const uniqueTickers = Array.from(new Set([...holdings.map((h) => h.ticker), "JPY=X"]));
      const priceMap = await fetchMetricsBatch(uniqueTickers, { concurrency: 6 });
      const usdJpy = priceMap.get("JPY=X")?.price ?? 150;
      const priceByTicker = new Map(holdings.map((h) => [h.ticker, { price: priceMap.get(h.ticker)?.price ?? null, currency: priceMap.get(h.ticker)?.currency ?? null }]));

      const { advice: computed, portfolioValueJpy: value } = computePortfolioAdvice(combinedPool, holdings, priceByTicker, usdJpy, cash);
      setAdvice(computed);
      setPortfolioValueJpy(value);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hidden) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- タブを開いた時に助言を計算
    loadAdvice();
  }, [hidden]);

  function handleSaveCash() {
    const n = Number(cashInput);
    const amount = Number.isFinite(n) && n >= 0 ? n : 0;
    saveCashJpy(amount);
    setCashJpy(amount);
    setEditingCash(false);
    void loadAdvice();
  }

  const scansMissing = scanReady && (!scanReady.jp || !scanReady.us);

  return (
    <section hidden={hidden} className="h-full">
      <GlassPageShell>
        <FxOutlookCard />
        <div className={`${GLASS_CARD} mb-3 sm:mb-4`}>
          <div className="flex items-center gap-2">
            <Users size={16} strokeWidth={2.25} className="text-[var(--accent)]" />
            <h2 className="text-[12.5px] font-extrabold text-[var(--foreground)]">運用アドバイザー</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            7人の仮想アドバイザーがあなたの保有銘柄・本日の注目銘柄を見て、
            <span className="font-semibold text-[var(--foreground)]">売却/新規買いの候補と推奨株数</span>
            を助言します(実際の売買は行いません)。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button onClick={loadAdvice} disabled={loading} className={GLASS_BTN_PRIMARY}>
              {loading ? "判断を実行中…" : "判断を実行する"}
            </button>
            {portfolioValueJpy > 0 && (
              <span className="text-[11px] text-[var(--text-muted)]">保有銘柄{holdingCount}件・評価額(円換算) {fmtYen(portfolioValueJpy)}</span>
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
                  className="w-32 rounded-md border border-[var(--border-subtle)] px-2 py-1 text-[12.5px]"
                  autoFocus
                />
                <button onClick={handleSaveCash} className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-white">
                  保存
                </button>
                <button onClick={() => setEditingCash(false)} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--foreground)]">
                  キャンセル
                </button>
              </>
            ) : (
              <>
                <span className="text-[12.5px] font-bold text-[var(--foreground)]">{fmtYen(cashJpy)}</span>
                <button
                  onClick={() => {
                    setCashInput(String(cashJpy || ""));
                    setEditingCash(true);
                  }}
                  className="text-[11px] text-[var(--accent)] hover:underline"
                >
                  編集
                </button>
              </>
            )}
            <span className="text-[11px] text-[var(--text-muted)]">— 買い推奨のうち、これで今すぐ買える銘柄は明るい色、買えない銘柄は薄く表示されます</span>
          </div>

          {scansMissing && (
            <div className="mt-3 rounded-lg bg-[var(--fill-pill)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
              「本日の注目銘柄」タブで{!scanReady?.jp && !scanReady?.us ? "日本株・米国株" : !scanReady?.jp ? "日本株" : "米国株"}のスキャンを完了させると、その銘柄も判断対象に含められます(未完了の市場は今回の判断から除外されています)。
            </div>
          )}
          {advice && holdingCount === 0 && (
            <div className="mt-3 rounded-lg bg-[var(--fill-pill)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
              「ポートフォリオ」タブに保有銘柄を登録すると、売り推奨・買い推奨の推奨株数(評価額に応じたサイジング)が計算されます。
            </div>
          )}
        </div>

        {advice && (
          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {DISPLAY_ORDER.map((id) => {
              const def = PERSONA_DEFS.find((p) => p.id === id)!;
              const a = advice.find((x) => x.personaId === id)!;
              return (
                <div
                  key={id}
                  className={def.isManager ? `${GLASS_CARD} lg:col-span-2` : GLASS_CARD}
                  style={
                    def.isManager
                      ? { background: "var(--gradient-hero)", border: "1px solid var(--gradient-hero-border)" }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      {id === "risk" ? (
                        <ShieldCheck size={12} strokeWidth={2.5} style={{ color: PERSONA_COLOR.risk }} />
                      ) : (
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PERSONA_COLOR[id] }} />
                      )}
                      <h3 className="text-[12.5px] font-bold text-[var(--foreground)]">{def.label}</h3>
                    </div>
                    {def.isManager && (
                      <span className="shrink-0 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[9px] font-bold text-white">最終決定</span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-muted)]" title={def.description}>{def.description}</p>

                  <div className="mt-3">
                    <div className="mb-1 flex items-center gap-1 text-[11px] font-bold text-[var(--accent)]">
                      <TrendingUp size={12} strokeWidth={2.5} />
                      買い推奨
                    </div>
                    {a.buys.length === 0 ? (
                      <p className="text-[11px] text-[var(--text-muted)]">なし</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {a.buys.map((b) => (
                          <li
                            key={b.ticker}
                            className={
                              !b.affordableNow
                                ? "group relative rounded-[16px] border border-[var(--card-border)] bg-[var(--card-bg)] px-2.5 py-1.5 text-[11px] opacity-60 backdrop-blur-[var(--card-blur)]"
                                : def.isManager
                                ? "group relative rounded-[16px] border border-[var(--accent)]/30 bg-[var(--card-bg)] px-2.5 py-1.5 text-[11px] shadow-[0_2px_6px_-2px_rgba(28,27,24,0.12)] backdrop-blur-[var(--card-blur)]"
                                : "group relative rounded-[16px] px-2.5 py-1.5 text-[11px] shadow-[0_1px_2px_rgba(28,27,24,0.04)]"
                            }
                            style={b.affordableNow && !def.isManager ? { background: "var(--gradient-hero)" } : undefined}
                          >
                            <DetailTooltip detail={b.detail} />
                            <div className="flex items-center justify-between">
                              <button
                                onClick={() => onOpenDetail(b.ticker, b.name ?? b.ticker)}
                                className="font-semibold hover:underline"
                                style={{ color: b.affordableNow ? "var(--foreground)" : "var(--text-secondary)" }}
                              >
                                {b.name ?? b.ticker}
                              </button>
                              <span className="font-mono text-[11px] font-bold" style={{ color: b.affordableNow ? "var(--accent)" : "var(--text-muted)" }}>
                                {b.suggestedShares}株({fmtYen(b.suggestedValueJpy)})
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                              <span>{b.reason}</span>
                              {b.estimatedFeeJpy > 0 && <span>手数料目安 {fmtYen(b.estimatedFeeJpy)}</span>}
                              {b.affordableNow ? (
                                <span className="rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 font-semibold text-[var(--accent)]">今すぐ買える</span>
                              ) : (
                                <span className="rounded-full bg-[#a39d8c]/15 px-1.5 py-0.5 font-semibold text-[var(--text-muted)]">資金不足</span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="mt-3">
                    <div className="mb-1 flex items-center gap-1 text-[11px] font-bold text-[var(--price-up)]">
                      <TrendingDown size={12} strokeWidth={2.5} />
                      売り推奨
                    </div>
                    {a.sells.length === 0 ? (
                      <p className="text-[11px] text-[var(--text-muted)]">なし</p>
                    ) : (
                      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {a.sells.map((s) => (
                          <li
                            key={s.ticker}
                            className="group relative flex items-center justify-between rounded-[16px] border border-[var(--card-border)] bg-[var(--card-bg)] px-2.5 py-1.5 text-[11px] backdrop-blur-[var(--card-blur)]"
                          >
                            <button onClick={() => onOpenDetail(s.ticker, s.name)} className="truncate font-semibold text-[var(--foreground)] hover:underline">
                              {s.name}
                            </button>
                            <DetailTooltip detail={s.detail} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <details className={`${GLASS_CARD} group`}>
          <summary className="cursor-pointer list-none text-[12.5px] font-bold text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1.5">
              検証用: このルールに従い続けた場合の仮想運用成績(架空資金)
              <span className="text-[11px] font-normal text-[var(--text-muted)] group-open:hidden">(クリックで開く)</span>
            </span>
          </summary>
          <div className="mt-3">
            <SimulatedTrackRecord />
          </div>
        </details>

        <details className={`${GLASS_CARD} group mt-4`}>
          <summary className="cursor-pointer list-none text-[12.5px] font-bold text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1.5">
              過去5年のトレンドフォロー検証(株価データのみ)・S&amp;P500との比較
              <span className="text-[11px] font-normal text-[var(--text-muted)] group-open:hidden">(クリックで開く)</span>
            </span>
          </summary>
          <div className="mt-3">
            <TrendBacktestCard />
          </div>
        </details>
      </GlassPageShell>
    </section>
  );
}

// 「このルールに従い続けたら実際どうなるか」を検証するための、架空資金(各運用者ごとに
// 元手¥1,000,000)でのシミュレーション結果。押すたびに現在のデータで判断をやり直す
// (personaStore.ts / /api/personas/run)。実際の売買には使わない検証用の補助情報。
function SimulatedTrackRecord() {
  interface PersonasResponse {
    lastRunDate: string | null;
    lastRunAt: string | null;
    usdJpy: number;
    accounts: Record<PersonaId, PersonaAccount>;
  }

  const [data, setData] = useState<PersonasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/personas/status", { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  async function runNow() {
    setRunning(true);
    setRunError(null);
    try {
      const res = await fetch("/api/personas/run", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setRunError(json.error ?? "判断の実行に失敗しました");
        if (json.state) setData(json.state);
        return;
      }
      setData(json);
    } catch {
      setRunError("判断の実行に失敗しました");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    if (loaded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 折りたたみを開いた時に一度だけ取得
    load();
  }, [loaded]);

  const allTrades = data
    ? PERSONA_DEFS.flatMap((d) => data.accounts[d.id].trades.map((t) => ({ ...t, personaId: d.id }))).sort((a, b) =>
        b.date.localeCompare(a.date)
      )
    : [];

  return (
    <div>
      <p className="text-[11px] text-[var(--text-secondary)]">
        各アドバイザーに架空の元手{fmtYen(STARTING_CASH_JPY)}(計7口座)を与え、上と同じルールで実際に売買させ続けたら成績がどうなるかを記録しています。実際の売買は一切行いません。
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button onClick={runNow} disabled={running} className={GLASS_BTN_GHOST}>
          {running ? "更新中…" : "検証データを更新する"}
        </button>
        {data?.lastRunAt && (
          <span className="text-[11px] text-[var(--text-muted)]">
            最終更新:{" "}
            {new Date(data.lastRunAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      {runError && <p className="mt-2 rounded-lg bg-[var(--price-up)]/10 px-3 py-2 text-[11px] text-[var(--price-up)]">{runError}</p>}
      {loading && !data && <div className="mt-3 text-xs text-[var(--text-secondary)]">読み込み中…</div>}

      {data && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {DISPLAY_ORDER.map((id) => {
              const def = PERSONA_DEFS.find((p) => p.id === id)!;
              const acc = data.accounts[id];
              const equity = acc.equityHistory.length > 0 ? acc.equityHistory[acc.equityHistory.length - 1].valueJPY : STARTING_CASH_JPY;
              const returnPct = ((equity - STARTING_CASH_JPY) / STARTING_CASH_JPY) * 100;
              return (
                <div key={id} className="rounded-xl bg-[var(--fill-subtle)] p-2.5">
                  <div className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: PERSONA_COLOR[id] }} />
                    <span className="text-[11px] font-bold text-[var(--foreground)]">{def.label.split("(")[0]}</span>
                  </div>
                  <div className="mt-1 text-[12.5px] font-extrabold text-[var(--foreground)]">{fmtYen(equity)}</div>
                  <div className="text-[11px] font-semibold" style={{ color: returnPct >= 0 ? "var(--status-good)" : "var(--price-up)" }}>
                    {returnPct >= 0 ? "+" : ""}
                    {returnPct.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>

          {allTrades.length > 0 && (
            <div className="mt-3 max-h-60 overflow-auto">
              <table className="w-full min-w-[480px] text-[11px]">
                <thead>
                  <tr className={`border-b border-[var(--border-subtle)] text-left ${GLASS_TEXT2}`}>
                    <th className="whitespace-nowrap py-1 pr-2 font-semibold">日付</th>
                    <th className="whitespace-nowrap py-1 pr-2 font-semibold">運用者</th>
                    <th className="whitespace-nowrap py-1 pr-2 font-semibold">銘柄</th>
                    <th className="whitespace-nowrap py-1 pr-2 font-semibold">売買</th>
                    <th className="whitespace-nowrap py-1 pr-2 font-semibold text-right">損益</th>
                  </tr>
                </thead>
                <tbody>
                  {allTrades.slice(0, 30).map((t, i) => (
                    <tr key={i} className="border-b border-[var(--fill-pill)] last:border-none">
                      <td className="whitespace-nowrap py-1 pr-2 text-[var(--text-muted)]">{t.date}</td>
                      <td className="whitespace-nowrap py-1 pr-2">{PERSONA_DEFS.find((d) => d.id === t.personaId)?.label.split("(")[0]}</td>
                      <td className="whitespace-nowrap py-1 pr-2">{t.name ?? t.ticker}</td>
                      <td className="whitespace-nowrap py-1 pr-2" style={{ color: t.side === "buy" ? "var(--price-up)" : "var(--price-down)" }}>
                        {t.side === "buy" ? "買い" : "売り"}
                      </td>
                      <td className="whitespace-nowrap py-1 pr-2 text-right" style={{ color: (t.plJPY ?? 0) >= 0 ? "var(--status-good)" : "var(--price-up)" }}>
                        {t.plJPY != null ? `${t.plJPY >= 0 ? "+" : ""}${fmtYen(t.plJPY)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
