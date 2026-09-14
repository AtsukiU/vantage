"use client";

interface RingGaugeProps {
  percent: number | null;
  label: string;
  valueText: string;
  benchmarkText: string;
  tooltip: string;
  good: boolean;
}

const SIZE = 72;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export function RingGauge({
  percent,
  label,
  valueText,
  benchmarkText,
  tooltip,
  good,
}: RingGaugeProps) {
  const pct = percent ?? 0;
  const offset = CIRC * (1 - pct / 100);
  const ringColor = good ? "var(--status-good)" : "var(--accent)";
  const trackColor = good ? "rgba(47,158,92,.15)" : "rgba(201,150,47,.15)";

  return (
    <div className="group relative text-center" tabIndex={0}>
      <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90 block">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={trackColor}
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={ringColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset .6s ease" }}
          />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center font-mono text-[15px] font-extrabold tabular-nums"
          style={{ color: ringColor }}
        >
          {percent != null ? percent : "—"}
        </div>
      </div>
      <div
        className="mt-2 text-[11px] font-bold"
        style={{ color: good ? ringColor : "var(--foreground)" }}
      >
        {label}
      </div>
      <div className="font-mono text-[9px] text-[var(--text-secondary)] tabular-nums">{valueText}</div>

      <div
        className="pointer-events-none absolute left-1/2 bottom-[calc(100%+10px)] z-30 w-52 -translate-x-1/2 translate-y-1
          rounded-[10px] bg-[#1c1b18] p-3 text-left text-[11px] font-normal leading-relaxed text-[#f4f2ea]
          opacity-0 shadow-lg transition-all duration-150
          group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
      >
        <b className="mb-1 block text-[11px] font-bold text-white">{label}</b>
        {tooltip}
        <span className="mt-1 block text-[11px] text-[#b8b3a4]">{benchmarkText}</span>
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-[6px] border-transparent border-t-[#1c1b18]" />
      </div>
    </div>
  );
}
