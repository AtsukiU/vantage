"use client";

import { useMemo, useState } from "react";
import { GLASS_BTN_GHOST } from "@/lib/glassStyles";
import { loadPortfolio } from "@/lib/portfolioStore";
import { History } from "lucide-react";

interface BacktestPoint {
  date: string;
  portfolioValue: number;
  benchmarkValue: number;
  heldCount: number;
}

interface BacktestResponse {
  startDate: string;
  endDate: string;
  startCapital: number;
  points: BacktestPoint[];
  usedTickers: string[];
  excludedTickers: string[];
  benchmarkLabel: string;
  portfolioEndValue: number;
  benchmarkEndValue: number;
  portfolioTotalReturnPercent: number;
  benchmarkTotalReturnPercent: number;
  portfolioCagrPercent: number;
  benchmarkCagrPercent: number;
}

function fmtYen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

function fmtPercent(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}`;
}

const W = 700;
const H = 200;
const PAD = 8;

function toPolyline(values: number[], min: number, max: number): string {
  const n = values.length;
  if (n < 2) return "";
  const xAt = (i: number) => PAD + (i / (n - 1)) * (W - PAD * 2);
  const yAt = (v: number) => H - PAD - ((v - min) / (max - min || 1)) * (H - PAD * 2);
  return values.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");
}

function BacktestChart({ points }: { points: BacktestPoint[] }) {
  const { portfolioPath, benchmarkPath } = useMemo(() => {
    const all = points.flatMap((p) => [p.portfolioValue, p.benchmarkValue]);
    const min = Math.min(...all) * 0.97;
    const max = Math.max(...all) * 1.03;
    return {
      portfolioPath: toPolyline(points.map((p) => p.portfolioValue), min, max),
      benchmarkPath: toPolyline(points.map((p) => p.benchmarkValue), min, max),
    };
  }, [points]);

  return (
    <div style={{ height: H }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-full w-full">
        {[0, 1, 2, 3].map((g) => {
          const y = PAD + (g / 3) * (H - PAD * 2);
          return <line key={g} x1={PAD} x2={W - PAD} y1={y} y2={y} stroke="rgba(35,31,53,.08)" strokeWidth={1} />;
        })}
        <polyline points={benchmarkPath} fill="none" stroke="var(--price-down)" strokeWidth={2} opacity={0.8} />
        <polyline points={portfolioPath} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
      </svg>
    </div>
  );
}

// 保有銘柄を対象に、過去5年分の株価データだけでトレンドフォロー戦略を検証し、
// S&P500の同期間の実績と比較する(trendBacktest.ts参照)。運用アドバイザーの実際の
// 判断ロジック(委員会スコア等)は過去に遡って再現できないため、あくまで価格トレンドのみの
// 簡易モデルであることをUI上でも明示する。
export function TrendBacktestCard() {
  const [result, setResult] = useState<BacktestResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noHoldings, setNoHoldings] = useState(false);

  async function run() {
    setRunning(true);
    setError(null);
    setNoHoldings(false);
    try {
      const holdings = await loadPortfolio();
      const tickers = Array.from(new Set(holdings.map((h) => h.ticker)));
      if (tickers.length === 0) {
        setNoHoldings(true);
        return;
      }
      const res = await fetch(`/api/persona-backtest?tickers=${encodeURIComponent(tickers.join(","))}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "バックテストに失敗しました");
        return;
      }
      setResult(json);
    } catch {
      setError("バックテストに失敗しました");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
        委員会スコアなどアドバイザーの実際の判断材料は「今日時点」の値しか持たないため、過去に遡って正確に再現することはできません。代わりに、5年分の実データが取れる株価だけを使い、
        <span className="font-semibold text-[var(--foreground)]">保有銘柄が200日移動平均線を上回っている月だけ均等配分で保有し、下回っている月はその分を現金で待機する</span>
        というトレンドフォロー型の簡易ルールで過去5年をシミュレーションし、S&amp;P500の実績と比較します。為替・配当・手数料は考慮していません。
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <button onClick={run} disabled={running} className={GLASS_BTN_GHOST}>
          <span className="inline-flex items-center gap-1.5">
            <History size={12} strokeWidth={2.25} />
            {running ? "計算中…(数十秒かかります)" : result ? "再計算する" : "過去5年のバックテストを実行する"}
          </span>
        </button>
      </div>

      {noHoldings && (
        <p className="mt-2.5 rounded-lg bg-[var(--fill-subtle)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
          保有銘柄がありません。ポートフォリオタブで保有銘柄を登録すると検証できます。
        </p>
      )}
      {error && <p className="mt-2.5 rounded-lg bg-[var(--price-up)]/10 px-3 py-2 text-[11px] text-[var(--price-up)]">{error}</p>}

      {result && (
        <div className="mt-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-[var(--fill-subtle)] p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--foreground)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                トレンドフォロー戦略(自分の保有銘柄)
              </div>
              <div className="mt-1 text-[15px] font-extrabold text-[var(--foreground)]">{fmtYen(result.portfolioEndValue)}</div>
              <div className="text-[11px] font-semibold" style={{ color: result.portfolioTotalReturnPercent >= 0 ? "var(--status-good)" : "var(--price-up)" }}>
                {fmtPercent(result.portfolioTotalReturnPercent)}(年率{fmtPercent(result.portfolioCagrPercent)})
              </div>
            </div>
            <div className="rounded-xl bg-[var(--fill-subtle)] p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--foreground)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--price-down)]" />
                {result.benchmarkLabel}(買い持ちのまま)
              </div>
              <div className="mt-1 text-[15px] font-extrabold text-[var(--foreground)]">{fmtYen(result.benchmarkEndValue)}</div>
              <div className="text-[11px] font-semibold" style={{ color: result.benchmarkTotalReturnPercent >= 0 ? "var(--status-good)" : "var(--price-up)" }}>
                {fmtPercent(result.benchmarkTotalReturnPercent)}(年率{fmtPercent(result.benchmarkCagrPercent)})
              </div>
            </div>
          </div>

          <div className="mt-3">
            <BacktestChart points={result.points} />
            <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-[var(--text-muted)]">
              <span>{fmtDate(result.startDate)}</span>
              <span>{fmtDate(result.endDate)}</span>
            </div>
            <div className="mt-1.5 flex gap-4 text-[11px] text-[var(--text-secondary)]">
              <span>
                <span className="mr-1 inline-block h-[2px] w-2 align-middle bg-[var(--accent)]" />
                トレンドフォロー戦略
              </span>
              <span>
                <span className="mr-1 inline-block h-[2px] w-2 align-middle bg-[var(--price-down)]" />
                {result.benchmarkLabel}
              </span>
            </div>
          </div>

          <p className="mt-2.5 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
            対象銘柄({result.usedTickers.length}件): {result.usedTickers.join("、")}
            {result.excludedTickers.length > 0 && <> ※価格データ不足のため除外: {result.excludedTickers.join("、")}</>}
            。元手{fmtYen(result.startCapital)}、月末リバランス・均等配分の簡易モデルによる試算で、実際の運用アドバイザーの判断や将来の成績を保証するものではありません。
          </p>
        </div>
      )}
    </div>
  );
}
