"use client";

import { computeTrailingStopHint } from "@/lib/trailingStop";

const DOWN = "#2f6fb0";

function fmt(n: number, currency: string): string {
  const prefix = currency === "JPY" ? "¥" : currency === "USD" ? "$" : "";
  const digits = currency === "JPY" ? 0 : 2;
  return `${prefix}${n.toLocaleString("ja-JP", { maximumFractionDigits: digits })}`;
}

// 含み益が出ているポジションにだけ表示する、50日線ベースのトレーリングストップ目安。
// 含み損のポジションは損切りラインの話であってこのバッジの対象ではないため何も出さない。
export function TrailingStopBadge({
  price,
  priceVs50ma,
  currency,
  isProfitable,
}: {
  price: number | null;
  priceVs50ma: number | null;
  currency: string;
  isProfitable: boolean;
}) {
  if (!isProfitable) return null;
  const hint = computeTrailingStopHint(price, priceVs50ma);
  if (!hint) return null;

  return (
    <div className="mt-0.5 text-[10.5px]" style={{ color: hint.belowMa50 ? DOWN : "#a39d8c" }}>
      {hint.belowMa50 ? "50日線を割れています" : `利確目安 50日線${fmt(hint.ma50Price, currency)}`}
    </div>
  );
}
