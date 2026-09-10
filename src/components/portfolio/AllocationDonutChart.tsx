"use client";

// 現金/株式・セクター・通貨などの構成比を見せるための、シンプルなドーナツ円グラフ。
// 隣り合う扇形の間に細い隙間(gapDeg)を空けて境界を見やすくする。

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

const SIZE = 120;
const CENTER = SIZE / 2;
const RADIUS = 50;
const THICKNESS = 16;
const GAP_DEG = 2;

function polarToXy(angleDeg: number, r: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
}

function arcPath(startDeg: number, endDeg: number): string {
  const outerR = RADIUS;
  const innerR = RADIUS - THICKNESS;
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const o1 = polarToXy(startDeg, outerR);
  const o2 = polarToXy(endDeg, outerR);
  const i1 = polarToXy(endDeg, innerR);
  const i2 = polarToXy(startDeg, innerR);
  return `M${o1.x.toFixed(2)},${o1.y.toFixed(2)} A${outerR},${outerR} 0 ${large} 1 ${o2.x.toFixed(2)},${o2.y.toFixed(2)} L${i1.x.toFixed(2)},${i1.y.toFixed(2)} A${innerR},${innerR} 0 ${large} 0 ${i2.x.toFixed(2)},${i2.y.toFixed(2)} Z`;
}

export function AllocationDonutChart({
  segments,
  centerLabel,
  size = SIZE,
}: {
  segments: DonutSegment[];
  centerLabel?: string;
  size?: number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const positive = segments.filter((s) => s.value > 0);

  if (total <= 0 || positive.length === 0) {
    return <div className="flex h-[120px] items-center justify-center text-[11px] text-[#a39d8c]">データがありません</div>;
  }

  // 各扇形の開始位置(度)を、直前までの割合の累計として先に求めておく(map内でのミューテーションを避ける)。
  const fractions = positive.map((seg) => seg.value / total);
  const cursors = fractions.reduce<number[]>((acc, f, i) => [...acc, (acc[i - 1] ?? 0) + f], []);
  const arcs = positive.map((seg, i) => {
    const fraction = fractions[i];
    const startDeg = (cursors[i] - fraction) * 360;
    const sweep = Math.max(fraction * 360 - (positive.length > 1 ? GAP_DEG : 0), 0);
    // SVGのA(楕円弧)コマンドは始点と終点が完全に一致すると「弧の長さ0」とみなされ何も描画されない
    // (ちょうど360°、つまり1セグメントだけで100%の時に起きる)。359.99°に丸めて回避する。
    const endDeg = startDeg + Math.min(sweep, 359.99);
    return { ...seg, pct: fraction * 100, path: arcPath(startDeg, endDeg) };
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0" style={{ height: size, width: size }}>
        {arcs.map((a) => (
          <path key={a.label} d={a.path} fill={a.color} />
        ))}
        {centerLabel && (
          <text x={CENTER} y={CENTER} textAnchor="middle" dominantBaseline="central" fontSize="21" fontWeight="700" fill="#1c1b18">
            {centerLabel}
          </text>
        )}
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {arcs.map((a) => (
          <div key={a.label} className="flex items-center gap-1.5 text-[12.5px]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.color }} />
            <span className="min-w-0 flex-1 truncate text-[#1c1b18]">{a.label}</span>
            <span className="shrink-0 tabular-nums text-[#6c6656]">{a.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
