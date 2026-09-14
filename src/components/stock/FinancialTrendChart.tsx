"use client";

import type { FinancialYear } from "@/lib/stockFinancials";

function formatAmount(n: number | null, currency: string | null): string {
  if (n == null) return "—";
  if (currency === "JPY") return `${(n / 1e12).toFixed(2)}兆円`;
  return `$${(n / 1e9).toFixed(1)}B`;
}

// 直近から遡って連続で増えている期数(「右肩上がりか」を一目で分かるようにする)。
function growthStreak(values: (number | null)[]): number {
  let streak = 0;
  for (let i = values.length - 1; i > 0; i--) {
    const cur = values[i];
    const prev = values[i - 1];
    if (cur == null || prev == null) break;
    if (cur > prev) streak++;
    else break;
  }
  return streak;
}

function TrendRow({
  label,
  suffix,
  values,
  years,
  currency,
}: {
  label: string;
  suffix: string;
  values: (number | null)[];
  years: string[];
  currency: string | null;
}) {
  const numericValues = values.filter((v): v is number => v != null);
  const max = Math.max(...numericValues.map((v) => Math.abs(v)), 1);
  const streak = growthStreak(values);
  const latest = values[values.length - 1];
  const prev = values[values.length - 2];
  const yoy = latest != null && prev != null && prev !== 0 ? ((latest - prev) / Math.abs(prev)) * 100 : null;

  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-xs font-bold text-[var(--foreground)]">
          {label} <span className="font-mono font-normal text-[var(--text-secondary)]">{formatAmount(latest, currency)}</span>
        </span>
        <span className="flex items-center gap-2 text-[11px]">
          {streak >= 2 && (
            <span
              className="rounded-full px-2 py-0.5 font-bold"
              style={{ background: "rgba(47,158,92,.12)", color: "var(--status-good)" }}
            >
              {streak}期連続{suffix}
            </span>
          )}
          {yoy != null && (
            <span
              className="tabular-nums font-semibold"
              style={{ color: yoy >= 0 ? "var(--price-up)" : "var(--price-down)" }}
            >
              前期比 {yoy >= 0 ? "+" : ""}
              {yoy.toFixed(1)}%
            </span>
          )}
        </span>
      </div>
      <div className="flex h-14 items-end gap-1.5">
        {values.map((v, i) => {
          const heightPct = v == null ? 0 : Math.max(6, (Math.abs(v) / max) * 100);
          const grew = i > 0 && values[i - 1] != null && v != null ? v >= (values[i - 1] as number) : null;
          const barColor = v == null ? "var(--border-subtle)" : grew === false ? "var(--price-down)" : "var(--accent)";
          return (
            <div key={years[i] + i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div
                className="w-full rounded-t transition-all"
                style={{ height: `${heightPct}%`, background: barColor }}
                title={`${years[i]}: ${formatAmount(v, currency)}`}
              />
              <span className="text-[9px] text-[var(--text-muted)]">{years[i]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FinancialTrendChart({
  data,
  currency,
}: {
  data: FinancialYear[];
  currency: string | null;
}) {
  if (data.length === 0) {
    return <div className="text-[12.5px] text-[var(--text-secondary)]">業績データを取得できませんでした</div>;
  }

  const years = data.map((d) => d.fiscalYearEnd.slice(0, 4) + "期");

  return (
    <div>
      <TrendRow label="売上高" suffix="増収" values={data.map((d) => d.revenue)} years={years} currency={currency} />
      <TrendRow
        label="営業利益"
        suffix="増益"
        values={data.map((d) => d.operatingIncome)}
        years={years}
        currency={currency}
      />
      <TrendRow label="純利益" suffix="増益" values={data.map((d) => d.netIncome)} years={years} currency={currency} />
    </div>
  );
}
