"use client";

import { useState } from "react";
import type { ScoreResult } from "@/lib/checklistTypes";
import type { CommitteeVerdict } from "@/lib/committeeScore";
import type { StockMetrics } from "@/lib/stockMetrics";
import type { TechnicalAnalysis } from "@/lib/stockTechnicals";
import type { StockSignals } from "@/lib/stockSignals";
import { Gavel } from "lucide-react";

const GOOD = "var(--status-good)";
const NEUTRAL = "var(--text-muted)";

const ROLE_LABEL: Record<keyof CommitteeVerdict["roles"], string> = {
  fundamental: "ファンダメンタル役",
  technical: "テクニカル役",
  sentiment: "センチメント役",
  risk: "リスク管理役",
  macro: "マクロ役",
  pm: "PM役(参考)",
};

export function CommitteeVerdictCard({
  metrics,
  technicals,
  signals,
  minervini,
  fundamentalRole,
  sentimentRole,
  macroRole,
  committee,
  marginOfSafetyRatio,
}: {
  metrics: StockMetrics;
  technicals: TechnicalAnalysis;
  signals: StockSignals;
  minervini: ScoreResult;
  fundamentalRole: ScoreResult;
  sentimentRole: ScoreResult;
  macroRole: ScoreResult;
  committee: CommitteeVerdict;
  marginOfSafetyRatio: number | null;
}) {
  const [verdict, setVerdict] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDiscuss() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stock/${encodeURIComponent(metrics.ticker)}/committee-discussion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: metrics.ticker,
          name: metrics.name,
          sector: metrics.sector,
          price: metrics.price,
          currency: metrics.currency,
          per: metrics.per,
          pbr: metrics.pbr,
          roe: metrics.roe,
          dividendYield: metrics.dividendYield,
          revenueGrowth: metrics.revenueGrowth,
          earningsGrowth: metrics.earningsGrowth,
          grahamNumber: metrics.grahamNumber,
          targetMeanPrice: metrics.targetMeanPrice,
          recommendationKey: metrics.recommendationKey,
          minerviniScore: minervini.passCount,
          minerviniTotal: minervini.total,
          rsi14: technicals.rsi14,
          pctFromWeek52High: technicals.pctFromWeek52High,
          netInstitutionalBuyingPercent: signals.netInstitutionalBuyingPercent,
          analystUpgrades90d: signals.upgrades90d,
          analystDowngrades90d: signals.downgrades90d,
          earningsBeatStreak: signals.beatStreak,
          fundamentalRoleScore: fundamentalRole.passCount,
          sentimentRoleScore: sentimentRole.passCount,
          macroRoleScore: macroRole.passCount,
          committeeAgree: committee.agree,
          committeeTotal: committee.total,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "生成に失敗しました");
      setVerdict(json.verdict);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="font-mono text-2xl font-extrabold"
            style={{ color: committee.agree / committee.total >= 0.6 ? GOOD : "var(--foreground)" }}
          >
            {committee.agree}/{committee.total}
          </span>
          <span className="text-[12.5px] text-[var(--text-secondary)]">役が賛成</span>
        </div>
        <button
          type="button"
          onClick={handleDiscuss}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-[12.5px] font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          <Gavel size={13} strokeWidth={2.25} />
          {loading ? "結論を生成中…" : verdict ? "もう一度結論を出す" : "投資委員会の結論を見る"}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {(Object.keys(committee.roles) as (keyof CommitteeVerdict["roles"])[])
          .filter((role) => role !== "pm")
          .map((role) => {
            const value = committee.roles[role];
            return (
              <div
                key={role}
                className="rounded-lg px-2.5 py-2 text-center"
                style={{ background: value === true ? "rgba(47,158,92,.1)" : "var(--fill-pill)" }}
              >
                <div className="text-[10.5px] text-[var(--text-secondary)]">{ROLE_LABEL[role]}</div>
                <div className="mt-0.5 text-[13px] font-extrabold" style={{ color: value === true ? GOOD : NEUTRAL }}>
                  {value === true ? "賛成" : value === false ? "反対/中立" : "判定中…"}
                </div>
              </div>
            );
          })}
      </div>

      <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-[var(--border-subtle)] px-2.5 py-1.5">
        <span className="shrink-0 rounded-full bg-[var(--fill-pill)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--text-secondary)]">参考(集計外)</span>
        <span className="text-[10.5px] text-[var(--text-secondary)]">PM役</span>
        <span className="ml-auto text-[12.5px] font-extrabold" style={{ color: committee.roles.pm === true ? GOOD : NEUTRAL }}>
          {committee.roles.pm === true ? "賛成" : committee.roles.pm === false ? "反対/中立" : "判定中…"}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-[var(--text-muted)]">
        <span>ファンダメンタル {fundamentalRole.passCount}/{fundamentalRole.total}</span>
        <span>テクニカル(ミネルヴィニ) {minervini.passCount}/{minervini.total}</span>
        <span>センチメント {sentimentRole.passCount}/{sentimentRole.total}</span>
        <span>マクロ {macroRole.passCount}/{macroRole.total}</span>
        <span>安全域 {marginOfSafetyRatio != null ? `現在値/グレアム数 ${marginOfSafetyRatio.toFixed(2)}倍` : "算出不可"}</span>
      </div>
      <p className="mt-1.5 text-[10.5px] text-[var(--text-muted)]">PM役は保有中のポートフォリオ(セクター・通貨集中度)から判定する参考情報で、上の合議人数(agree/total)には含まれません。保有銘柄がない場合は対象外として賛成扱いになります。</p>

      {error && (
        <p className="mt-3 rounded-lg bg-[var(--price-up)]/10 px-3 py-2 text-[11px] leading-relaxed text-[var(--price-up)]">{error}</p>
      )}

      {verdict && (
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
          <div className="rounded-lg bg-[var(--fill-subtle)] p-3">
            <div className="mb-1 text-[11px] font-extrabold text-[var(--accent)]">委員会の結論</div>
            <div className="text-[12.5px] leading-relaxed text-[var(--foreground)]">{verdict}</div>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
            Claudeが生成した結論のシミュレーションです。売買の推奨ではなく、実際の判断・発注はご自身で行ってください。
          </p>
        </div>
      )}
    </div>
  );
}
