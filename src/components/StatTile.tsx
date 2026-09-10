import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { GLASS_CARD, GLASS_UP, GLASS_DOWN, GLASS_HERO } from "@/lib/glassStyles";

// カラーアイコンバッジ付きのKPIタイル。数字の羅列より一目で種類を区別できるようにするための、
// ダッシュボードでよくあるパターン(色付きの丸背景+アイコン+大きな数字+補足デルタ)。
// VANTAGE既存のティール×ゴールド系パレットの中で使う(色味自体は変えない)。
//
// variant="hero": 1画面に1つだけ、一番見てほしい数値をオレンジの塗りつぶしカードで目立たせる。
// 白背景のデルタ表示と違い塗り背景の上では赤/青の意味付けはコントラスト的に読みにくいため、
// hero時は矢印のみで方向を示す(色による上昇/下落の意味付けは株価表示側だけに残す)。

export function StatTile({
  icon: Icon,
  iconColor,
  label,
  value,
  delta,
  variant = "default",
  onClick,
  children,
}: {
  icon: LucideIcon;
  iconColor: string;
  label: string;
  value: string;
  delta?: { text: string; positive: boolean } | null;
  variant?: "default" | "hero";
  onClick?: () => void;
  children?: ReactNode;
}) {
  const Tag = onClick ? "button" : "div";
  const interactive = onClick ? "w-full text-left cursor-pointer transition hover:brightness-[0.97]" : "";

  if (variant === "hero") {
    return (
      <Tag onClick={onClick} className={`rounded-[18px] p-6 ${interactive}`} style={{ background: GLASS_HERO }}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
            <Icon size={18} strokeWidth={2.25} className="text-white" />
          </span>
          <div className="min-w-0">
            <div className="text-xs text-white/80">{label}</div>
            <div className="mt-0.5 truncate text-2xl font-bold tabular-nums text-white">{value}</div>
          </div>
        </div>
        {delta && <div className="mt-2 text-sm font-semibold tabular-nums text-white/90">{delta.text}</div>}
        {children}
      </Tag>
    );
  }

  return (
    <Tag onClick={onClick} className={`${GLASS_CARD} ${interactive}`}>
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: `${iconColor}1f` }}
        >
          <Icon size={18} strokeWidth={2.25} style={{ color: iconColor }} />
        </span>
        <div className="min-w-0">
          <div className="text-xs text-[#6c6656]">{label}</div>
          <div className="mt-0.5 truncate text-2xl font-bold tabular-nums text-[#1c1b18]">{value}</div>
        </div>
      </div>
      {delta && (
        <div className="mt-2 text-sm font-semibold tabular-nums" style={{ color: delta.positive ? GLASS_UP : GLASS_DOWN }}>
          {delta.text}
        </div>
      )}
      {children}
    </Tag>
  );
}
