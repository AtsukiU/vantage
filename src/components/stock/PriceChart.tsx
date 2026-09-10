"use client";

import { useMemo } from "react";
import type { PricePoint, ChartRange } from "@/lib/stockChart";

interface PriceChartProps {
  points: PricePoint[];
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
}

const RANGES: { key: ChartRange; label: string }[] = [
  { key: "1mo", label: "1M" },
  { key: "6mo", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "2y", label: "2Y" },
];

const W = 700;
const H = 220;
const PAD = 8;

function toPolyline(values: (number | null)[], min: number, max: number): string {
  const n = values.length;
  if (n < 2) return "";
  const xAt = (i: number) => PAD + (i / (n - 1)) * (W - PAD * 2);
  const yAt = (v: number) => H - PAD - ((v - min) / (max - min || 1)) * (H - PAD * 2);
  return values
    .map((v, i) => (v == null ? null : `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`))
    .filter((v): v is string => v != null)
    .join(" ");
}

export function PriceChart({ points, range, onRangeChange }: PriceChartProps) {
  const { pricePath, ma50Path, ma200Path, areaPath } = useMemo(() => {
    if (points.length < 2) {
      return { pricePath: "", ma50Path: "", ma200Path: "", areaPath: "" };
    }
    const closes = points.map((p) => p.close);
    const min = Math.min(...closes) * 0.98;
    const max = Math.max(...closes) * 1.02;
    const pricePath = toPolyline(closes, min, max);
    const ma50Path = toPolyline(
      points.map((p) => p.ma50),
      min,
      max
    );
    const ma200Path = toPolyline(
      points.map((p) => p.ma200),
      min,
      max
    );
    const areaPath = pricePath ? `${PAD},${H - PAD} ${pricePath} ${W - PAD},${H - PAD}` : "";
    return { pricePath, ma50Path, ma200Path, areaPath };
  }, [points]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-extrabold text-[#1c1b18]">株価推移</h3>
        <div className="flex gap-[3px] rounded-full bg-[#f0efe6] p-[3px]">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => onRangeChange(r.key)}
              className={`rounded-full px-[11px] py-[5px] text-[11px] font-semibold transition ${
                range === r.key ? "bg-white text-[#1c1b18] shadow-sm" : "text-[#6c6656]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: H }}>
        {pricePath ? (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-full w-full">
            {[0, 1, 2, 3].map((g) => {
              const y = PAD + (g / 3) * (H - PAD * 2);
              return (
                <line
                  key={g}
                  x1={PAD}
                  x2={W - PAD}
                  y1={y}
                  y2={y}
                  stroke="rgba(35,31,53,.08)"
                  strokeWidth={1}
                />
              );
            })}
            <polygon points={areaPath} fill="#c9962f" opacity={0.1} />
            {ma200Path && (
              <polyline points={ma200Path} fill="none" stroke="#2f6fb0" strokeWidth={1} opacity={0.55} />
            )}
            {ma50Path && (
              <polyline points={ma50Path} fill="none" stroke="#c0392b" strokeWidth={1} opacity={0.55} />
            )}
            <polyline points={pricePath} fill="none" stroke="#c9962f" strokeWidth={2} />
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-[12.5px] text-[#6c6656]">
            チャートデータがありません
          </div>
        )}
      </div>

      <div className="mt-2 flex gap-4 text-[11px] text-[#6c6656]">
        <span>
          <span className="mr-1 inline-block h-[2px] w-2 align-middle bg-[#c9962f]" />
          終値
        </span>
        <span>
          <span className="mr-1 inline-block h-[2px] w-2 align-middle bg-[#c0392b]" />
          50日線
        </span>
        <span>
          <span className="mr-1 inline-block h-[2px] w-2 align-middle bg-[#2f6fb0]" />
          200日線
        </span>
      </div>
    </div>
  );
}
