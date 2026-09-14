"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, animate } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { GlassPageShell } from "../GlassPageShell";
import { NewsPreviewModal } from "../NewsPreviewModal";
import { OverallScoreBadge } from "../OverallScoreBadge";
import { loadPortfolio, loadCashJpy, type Holding } from "@/lib/portfolioStore";
import { getHistory, type PortfolioSnapshot } from "@/lib/portfolioHistoryStore";
import { fetchMetricsBatch } from "@/lib/fetchMetricsBatch";
import type { StockMetrics } from "@/lib/stockMetrics";
import type { DailyScreenState, DailyScreenEntry, ScreenMarket } from "@/lib/dailyScreenStore";
import { computeOverallScore } from "@/lib/dailyPickOverall";
import { computePortfolioAdvice } from "@/lib/portfolioAdvice";
import { computePortfolioHealth } from "@/lib/portfolioHealth";
import type { NewsItem } from "@/lib/news";
import { categorizeNewsTitle, NEWS_CATEGORY_LABEL } from "@/lib/newsCategory";
import type { Quote } from "@/lib/quotes";
import type { FilterExplanation } from "@/lib/personaRules";
import { GLASS_UP, GLASS_DOWN, GLASS_TEXT, GLASS_TEXT2, GLASS_BORDER } from "@/lib/glassStyles";
import { sectorLabelJa, SECTOR_ORDER } from "@/lib/sectorLabels";
import { Wallet, TrendingUp, Star, ChevronRight, AlertTriangle } from "lucide-react";

type NavTab = "news" | "dailypicks" | "personas" | "portfolio";

// 「web appらしい」モダンな見た目 + 単色4段階トーン配色(設定タブのテーマ、globals.cssの
// --tone-1..4)を採用したダッシュボード実装。カードの角丸・背景・ぼかしは他タブと同じ
// --card-*変数を参照するため、テーマを切り替えると自動で追従する。総資産の数字・推移
// グラフ・セクター/現金比率バーなど「濃淡だけで区別したい」箇所にだけ--tone-1(最も濃い)
// 〜--tone-4(最も淡い)を使う。それ以外の本文色・境界線は他タブと共通のGLASS_TEXT系。
const CARD = "rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--card-bg)] backdrop-blur-[var(--card-blur)] shadow-[var(--card-shadow)]";
// 買い推奨・注目銘柄1位など「これを見てほしい」項目用。淡いグラデーションで色を残す。
const HERO_ITEM = "relative overflow-hidden rounded-[8px] border border-[var(--gradient-hero-border)] p-2.5 text-left shadow-[0_1px_2px_rgba(28,27,24,0.04)] transition hover:brightness-[0.97]";
// それ以外の一覧項目(売り推奨・2位以下)。カードと揃えた質感。
const FLAT_ITEM = "rounded-[8px] border border-[var(--card-border)] bg-black/[0.015] p-2.5 text-left transition hover:bg-black/[0.03]";

// LiveNewsTickerのバッジ色(newsCategory.tsのNEWS_CATEGORY_COLORは明るい背景前提の
// Tailwindクラスなので、ティッカーの暗い背景でも読める彩度のある単色をここで別に用意する)。
// ニュースティッカーのカテゴリバッジ色。白文字を乗せる前提の固定パレットなので、
// ダークモードでも(本文の文字色などと違って)変えない。
const TICKER_CATEGORY_COLOR: Record<string, string> = {
  market: "#2f6fb0",
  quote: "#2f9e5c",
  ranking: "#c79a2e",
  other: "#6c6656",
};

// HERO_ITEM(推しカード)に定期的に光が斜めに走る「シャイン」演出。「一番見てほしい」
// カードだけに使い、常時動きがあることで一覧の中でも視線を集める。
function ShineSweep() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent"
      animate={{ x: ["-120%", "320%"] }}
      transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut" }}
    />
  );
}

// 注目ニュースを1件ずつ流す、速報ティッカー風の細い帯。市場・為替カードを大きくする
// 分、ニュース側は薄くコンパクトにする(見出しは記事リンクを開けば十分読めるので、
// ここでは「今何が動いているか」がひと目でわかれば良い)。
function LiveNewsTicker({ items, onSelect }: { items: NewsItem[]; onSelect: (item: NewsItem) => void }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % items.length), 4000);
    return () => window.clearInterval(id);
  }, [items.length]);

  if (items.length === 0) {
    return (
      <div
        className="flex shrink-0 items-center justify-center gap-1 rounded-[10px] px-4 py-2.5 font-mono text-[11px]"
        style={{ background: "#0a0c0e", color: "rgba(255,255,255,.5)" }}
      >
        読み込み中
        <motion.span
          aria-hidden
          className="inline-block h-3 w-[6px] bg-current"
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    );
  }
  const item = items[index % items.length];
  const category = categorizeNewsTitle(item.title);

  return (
    <button
      onClick={() => onSelect(item)}
      className="relative flex shrink-0 items-center gap-3 overflow-hidden rounded-[10px] px-4 py-2.5 text-left"
      style={{ background: "#0a0c0e" }}
    >
      <motion.div
        aria-hidden
        className="glow-blob pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[var(--accent)]/25 blur-[48px]"
        animate={{ x: [0, -8, 5, 0], y: [0, 6, -4, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <span
        className="relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[9px] font-extrabold text-white"
        style={{ background: TICKER_CATEGORY_COLOR[category] }}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-80" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
        </span>
        {NEWS_CATEGORY_LABEL[category]}
      </span>
      <div className="relative flex h-[34px] min-w-0 flex-1 items-center overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={item.link}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-white"
          >
            {item.title}
          </motion.div>
        </AnimatePresence>
      </div>
    </button>
  );
}

function CardHeader({
  icon: Icon,
  iconColor,
  title,
  onNavigate,
}: {
  icon: LucideIcon;
  iconColor: string;
  title: string;
  onNavigate?: () => void;
}) {
  const content = (
    <>
      <Icon size={14} strokeWidth={2.25} style={{ color: iconColor }} />
      <h3 className="flex-1 text-[12.5px] font-extrabold" style={{ color: GLASS_TEXT }}>
        {title}
      </h3>
      {onNavigate && <ChevronRight size={14} strokeWidth={2.5} style={{ color: GLASS_TEXT2 }} />}
    </>
  );
  if (!onNavigate) {
    return <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">{content}</div>;
  }
  return (
    <button onClick={onNavigate} className="flex shrink-0 items-center gap-2 rounded-t-[var(--card-radius)] px-3 pb-2 pt-3 text-left transition hover:bg-black/[0.03]">
      {content}
    </button>
  );
}

// こんばんは+日付+4つの数字を、背景の総資産推移グラフと同じカードに溶け込ませて表示する
// 「ヒーロー」ブロック。境界のあるカードを積むのではなく、1枚のカードの上に文字とグラフを
// 重ねることで「資産と推移グラフが同じ要素」に見えるようにする(過去のデザイン検討で確定した方向性)。
// 終着点マーカーや軸ラベル・日付レンジのキャプションは意図的に付けない(検討時に不要と判断された)。
function AmbientChart({ history }: { history: PortfolioSnapshot[] }) {
  if (history.length < 2) return null;
  const W = 800;
  const H = 220;
  const totals = history.map((h) => h.valueJpy + h.cashJpy);
  const max = Math.max(...totals, 1);
  const min = Math.min(...totals, 0);
  const span = Math.max(max - min, 1);

  function yFor(v: number): number {
    // 上下に少し余白を持たせ、線がカードの縁ぎりぎりに張り付かないようにする
    return H * 0.12 + (1 - (v - min) / span) * (H * 0.76);
  }
  function xFor(i: number): number {
    return (i / (history.length - 1)) * W;
  }

  const points = history.map((h, i) => ({ x: xFor(i), y: yFor(h.valueJpy + h.cashJpy) }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const fillPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${H} L${points[0].x.toFixed(1)},${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id="ambientFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--tone-3)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--tone-4)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={fillPath}
        fill="url(#ambientFill)"
        stroke="none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.4 }}
      />
      <motion.path
        d={linePath}
        fill="none"
        stroke="var(--tone-2)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.7 }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
      />
    </svg>
  );
}

function computeAssetDeltas(history: PortfolioSnapshot[]): { dayPct: number | null; monthPct: number | null } {
  if (history.length < 2) return { dayPct: null, monthPct: null };
  const totals = history.map((h) => ({ date: h.date, total: h.valueJpy + h.cashJpy }));
  const last = totals[totals.length - 1];
  const prevDay = totals[totals.length - 2];
  const dayPct = prevDay.total > 0 ? ((last.total - prevDay.total) / prevDay.total) * 100 : null;

  const lastDate = new Date(last.date);
  const monthAgo = new Date(lastDate);
  monthAgo.setDate(monthAgo.getDate() - 30);
  const monthAgoStr = monthAgo.toISOString().slice(0, 10);

  let monthPct: number | null = null;
  // 30日以上前の記録がある場合のみ算出する(記録が浅いうちは不正確な比較になるため)
  if (totals[0].date <= monthAgoStr) {
    const monthEntry = totals.slice().reverse().find((t) => t.date <= monthAgoStr) ?? totals[0];
    monthPct = monthEntry.total > 0 ? ((last.total - monthEntry.total) / monthEntry.total) * 100 : null;
  }
  return { dayPct, monthPct };
}

// 数字が変わるたびにゆるくカウントアップ/ダウンさせる(ページ読み込み時・値更新時どちらも)。
// 「モダンなwebapp風」の演出の一つとして、静的な数字の差し替えより変化が目に留まりやすくする。
function useCountUp(value: number, duration = 0.7): number {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = value;
    if (from === value) return;
    const controls = animate(from, value, { duration, ease: "easeOut", onUpdate: setDisplay });
    return () => controls.stop();
  }, [value, duration]);
  return display;
}

function StatBlock({
  value,
  format,
  valueColor,
  label,
  deltaNode,
  onClick,
}: {
  value: number;
  format: (n: number) => string;
  valueColor?: string;
  label: string;
  deltaNode?: ReactNode;
  onClick?: () => void;
}) {
  const display = useCountUp(value);
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      className="flex min-w-0 flex-col gap-0.5 rounded-[8px] p-1.5 text-left transition-colors hover:bg-black/[0.03]"
    >
      <div className="truncate text-[11px] font-medium" style={{ color: GLASS_TEXT2 }}>
        {label}
      </div>
      <div className="truncate text-[22px] font-extrabold tabular-nums leading-tight" style={{ color: valueColor ?? GLASS_TEXT }}>
        {format(display)}
      </div>
      {deltaNode}
    </motion.button>
  );
}

function AllocationBarRow({
  label,
  segments,
}: {
  label: string;
  segments: { label: string; value: number; color: string }[];
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const positive = segments.filter((s) => s.value > 0);
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold" style={{ color: GLASS_TEXT2 }}>
        {label}
      </div>
      {total <= 0 || positive.length === 0 ? (
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          データがありません
        </div>
      ) : (
        <>
          <div className="relative flex h-2 gap-[2px] overflow-hidden rounded-full" style={{ background: "var(--tone-4)" }}>
            {positive.map((s) => {
              const isHovered = hovered === s.label;
              const isDimmed = hovered !== null && !isHovered;
              return (
                <motion.div
                  key={s.label}
                  onMouseEnter={() => setHovered(s.label)}
                  onMouseLeave={() => setHovered(null)}
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(s.value / total) * 100}%`,
                    opacity: isDimmed ? 0.35 : 1,
                    filter: isHovered ? "brightness(1.25)" : "brightness(1)",
                  }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="rounded-full"
                  style={{ background: s.color }}
                />
              );
            })}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-10 bg-white/50 blur-[2px]"
              style={{ mixBlendMode: "overlay" }}
              // xだとtransformなので%は「この要素自身(40px)」基準になり、バー全体(数百px)の
              // ごく左側だけを行き来して「真ん中で止まって見える」原因になっていた。leftは
              // 通常のCSSプロパティなので親要素(バー全体)基準の%になり、全幅を正しく掃引する。
              animate={{ left: ["-10%", "110%"] }}
              transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.4, ease: "easeInOut" }}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {positive.map((s) => {
              const isHovered = hovered === s.label;
              const isDimmed = hovered !== null && !isHovered;
              return (
                <motion.span
                  key={s.label}
                  onMouseEnter={() => setHovered(s.label)}
                  onMouseLeave={() => setHovered(null)}
                  animate={{ opacity: isDimmed ? 0.4 : 1 }}
                  className="inline-flex cursor-default items-center gap-1 text-[11px]"
                  style={{ color: GLASS_TEXT }}
                >
                  <motion.span
                    animate={{ scale: isHovered ? 1.3 : 1 }}
                    className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ background: s.color }}
                  />
                  {s.label} <span style={{ color: GLASS_TEXT2 }}>{((s.value / total) * 100).toFixed(0)}%</span>
                </motion.span>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// 保有セクター別のグラフ改善案(scratchpad/sector-allocation-variants.htmlのV1「ドーナツ+中央合計」を採用)。
// 細い1本のバーだと近い比率・小さい比率が読み取りにくかったため、中央に評価額の合計を置いた
// ドーナツ+凡例の構成に変更。凡例はAllocationBarRowと同じホバー連動(該当区画だけ明るくなる)。
function SectorDonut({
  label,
  segments,
  centerValue,
  centerLabel,
}: {
  label: string;
  segments: { label: string; value: number; color: string }[];
  centerValue: string;
  centerLabel: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const positive = segments.filter((s) => s.value > 0);

  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold" style={{ color: GLASS_TEXT2 }}>
        {label}
      </div>
      {total <= 0 || positive.length === 0 ? (
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          データがありません
        </div>
      ) : (
        (() => {
          const size = 104;
          const r = 38;
          const stroke = 14;
          const cx = size / 2;
          const cy = size / 2;
          const circ = 2 * Math.PI * r;
          let offset = 0;
          return (
            <div className="flex items-center gap-4">
              <motion.svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                className="shrink-0"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                {positive.map((s) => {
                  const pct = s.value / total;
                  const len = pct * circ;
                  const isHovered = hovered === s.label;
                  const isDimmed = hovered !== null && !isHovered;
                  const el = (
                    <motion.circle
                      key={s.label}
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={stroke}
                      strokeDasharray={`${len} ${circ - len}`}
                      strokeDashoffset={-offset}
                      transform={`rotate(-90 ${cx} ${cy})`}
                      animate={{ opacity: isDimmed ? 0.35 : 1 }}
                      style={{ filter: isHovered ? "brightness(1.25)" : "brightness(1)" }}
                      onMouseEnter={() => setHovered(s.label)}
                      onMouseLeave={() => setHovered(null)}
                    />
                  );
                  offset += len;
                  return el;
                })}
                <text x={cx} y={cy - 2} textAnchor="middle" fontSize="13" fontWeight="800" fill={GLASS_TEXT}>
                  {centerValue}
                </text>
                <text x={cx} y={cy + 12} textAnchor="middle" fontSize="8.5" fill={GLASS_TEXT2}>
                  {centerLabel}
                </text>
              </motion.svg>
              <div className="flex min-w-0 flex-col gap-1">
                {positive.map((s) => {
                  const isHovered = hovered === s.label;
                  const isDimmed = hovered !== null && !isHovered;
                  return (
                    <motion.div
                      key={s.label}
                      onMouseEnter={() => setHovered(s.label)}
                      onMouseLeave={() => setHovered(null)}
                      animate={{ opacity: isDimmed ? 0.4 : 1 }}
                      className="flex cursor-default items-center gap-1.5 text-[11px]"
                      style={{ color: GLASS_TEXT }}
                    >
                      <motion.span
                        animate={{ scale: isHovered ? 1.3 : 1 }}
                        className="h-[7px] w-[7px] shrink-0 rounded-full"
                        style={{ background: s.color }}
                      />
                      <span className="truncate">{s.label}</span>
                      <span className="ml-auto shrink-0 font-semibold" style={{ color: GLASS_TEXT2 }}>
                        {((s.value / total) * 100).toFixed(0)}%
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("ja-JP");
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

// 決算まで何日か(過去日・不明ならnull)。保有銘柄一覧に「決算7日以内」のバッジを出すために使う。
function daysUntilEarnings(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

interface TooltipAnchor {
  rect: DOMRect;
  reason: string;
  detail: FilterExplanation[];
}

// アドバイザーの買い/売り推奨カードのホバー内訳(OverallScoreBadgeと同じ「代表値+ホバーで詳細」の
// 構成)。portfolioAdvice.tsのreason/detailは元々このため用意されていたが、UI側で未使用だった。
// 最初はgroup-hover連動の絶対配置で作ったが、この一覧自体がoverflow-y-auto(スクロール)+
// 親カードがoverflow-hidden(角丸クリップ)なので、吹き出しがカード範囲で見切れる上に
// スクロール領域の高さにまで数えられてホバーのたびに縦スクロールバーが出てしまっていた。
// document.bodyへポータルし、position:fixedでトリガー要素のgetBoundingClientRect()を
// 基準に配置することで、両方のoverflow制約を完全に回避する。
function AdviceTooltip({ anchor }: { anchor: TooltipAnchor | null }) {
  if (!anchor || typeof document === "undefined") return null;
  const { rect, reason, detail } = anchor;
  // 見出し+内訳行数から高さを概算し、下に出すと画面下端で見切れる時だけ上向きに開く
  // (逆に、画面上端に近いカードでは今まで通り下向きのままでいい)。
  const estimatedHeight = 40 + detail.length * 22;
  const openUpward = window.innerHeight - rect.bottom < estimatedHeight + 12;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 248));
  const position: { top?: number; bottom?: number } = openUpward
    ? { bottom: window.innerHeight - rect.top + 6 }
    : { top: rect.bottom + 6 };
  return createPortal(
    <div
      className="pointer-events-none fixed z-50 w-60 rounded-lg bg-[#1c1b18] p-2.5 text-left text-[11px] font-normal text-white shadow-lg"
      style={{ ...position, left }}
    >
      <div className="mb-1.5 font-semibold text-white/90">{reason}</div>
      {detail.map((d, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-0.5" style={{ color: d.pass ? "var(--status-good-soft)" : "var(--status-bad-soft)" }}>
          <span>
            {d.pass ? "✓" : "✕"} {d.label}
          </span>
          <span className="font-mono">{d.value}</span>
        </div>
      ))}
    </div>,
    document.body
  );
}

interface QuoteRow {
  label: string;
  price: number | null;
  format: (n: number) => string;
  changePercent: number | null;
  changePercentMonth: number | null;
}

function changeColor(pct: number | null): string {
  if (pct == null) return "rgba(255,255,255,.35)";
  if (pct > 0) return "#ff8a7a";
  if (pct < 0) return "#7fc4ff";
  return "rgba(255,255,255,.6)";
}

function fmtChg(pct: number | null): string {
  if (pct == null) return "--";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

// 1行分。価格が変わった瞬間だけ背景を一瞬フラッシュさせ(上昇=赤寄り/下落=青寄り、
// 既存のchangeColorと同じ配色)、数字自体も総資産カードと同じuseCountUpで前の値から
// なめらかにカウントする。20秒ごとのポーリング(下のQuoteTerminal側)と組み合わせて
// 初めて意味を持つ演出なので、この2つはセットで導入している。
function QuoteRowView({ row }: { row: QuoteRow }) {
  const displayPrice = useCountUp(row.price ?? 0, 0.6);
  const prevPriceRef = useRef<number | null>(row.price);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const prev = prevPriceRef.current;
    prevPriceRef.current = row.price;
    if (row.price == null || prev == null || row.price === prev) return;
    setFlash(row.price > prev ? "up" : "down");
    const t = setTimeout(() => setFlash(null), 800);
    return () => clearTimeout(t);
  }, [row.price]);

  return (
    <motion.div
      className="flex items-center gap-2 rounded-[4px] border-b border-white/[0.08] px-1 py-1.5 last:border-none"
      animate={{
        backgroundColor: flash === "up" ? "rgba(255,138,122,0.22)" : flash === "down" ? "rgba(127,196,255,0.2)" : "rgba(255,255,255,0)",
      }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <span className="w-16 shrink-0 truncate text-[11px] font-bold" style={{ color: "var(--tone-4)" }}>
        {row.label}
      </span>
      <span className="flex-1 text-right text-[11px] font-bold tabular-nums text-white">
        {row.price != null ? row.format(displayPrice) : "--"}
      </span>
      <span className="flex-1 text-right text-[9px] font-bold tabular-nums" style={{ color: changeColor(row.changePercent) }}>
        {fmtChg(row.changePercent)}
      </span>
      <span className="flex-1 text-right text-[9px] font-bold tabular-nums" style={{ color: changeColor(row.changePercentMonth) }}>
        {fmtChg(row.changePercentMonth)}
      </span>
    </motion.div>
  );
}

// トレーディング端末風の一覧(市場デザイン検討のE12案を採用)。現在値に加え、前日比・
// 前月比の2列を並べ、期間別の勢いを一度に見せる。マーキーではなく静止した
// テーブルなので、証券会社の発注画面のような「数字が主役」の見せ方になる。
// E12の元案は黒背景(#0a0c0e)だったが、カード自体の濃いシアン(--tone-1)の上に黒い箱を
// 別途重ねると浮いて見えたため、独自背景は持たずカードのグラデーションにそのまま乗せる
// (見出し行の罫線だけで表とヘッダーの区切りを示す)。ラベル色もテーマと無関係な緑ではなく
// --tone-4(このテーマの最も淡いシアン)にして、他のシアン系アクセントと馴染むようにしている。
// 前年比の列を削除した後、残り3列(現在値・前日比・前月比)を固定幅のまま左詰めにすると
// カード右側が余って間延びして見えたため、各列をflex-1にしてカード幅いっぱいに均等配分する。
function QuoteTerminal({ rows }: { rows: QuoteRow[] }) {
  return (
    <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-white/10 pb-1.5">
        <span className="w-16 shrink-0" />
        <span className="flex-1 text-right text-[9px] font-bold tracking-wide text-white/35">現在値</span>
        <span className="flex-1 text-right text-[9px] font-bold tracking-wide text-white/35">前日比</span>
        <span className="flex-1 text-right text-[9px] font-bold tracking-wide text-white/35">前月比</span>
      </div>
      {rows.map((r) => (
        <QuoteRowView key={r.label} row={r} />
      ))}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "こんばんは";
  if (h < 11) return "おはようございます";
  if (h < 17) return "こんにちは";
  return "こんばんは";
}

function todayLabel(): string {
  return new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}

interface TopPick extends DailyScreenEntry {
  overallScore: number;
  overallGrade: string;
  market: ScreenMarket;
}

const SECTOR_TONES = ["var(--tone-1)", "var(--tone-2)", "var(--tone-3)", "var(--tone-4)"];
// セクター名(英語の原文字列)に固定の色を割り当てる。以前は保有比率順(大きい順)に
// SECTOR_TONESを割り振っていたため、保有比率が変わって順位が入れ替わると同じセクターでも
// 色が変わってしまっていた(sector-allocation-variants.htmlの検討で見つかった問題)。
// セクター名ごとに固定のインデックスを引くことで、色を保有比率と無関係に安定させる
// (並び順はsectorLabels.tsのSECTOR_ORDERをPortfolioTab.tsxと共有)。
function sectorColor(sector: string): string {
  const idx = SECTOR_ORDER.indexOf(sector);
  if (idx === -1) return "var(--text-muted)";
  return SECTOR_TONES[idx % SECTOR_TONES.length];
}

export function DashboardTab({
  hidden,
  onOpenDetail,
  onNavigateTab,
  refreshSignal,
}: {
  hidden: boolean;
  onOpenDetail: (symbol: string, name: string) => void;
  onNavigateTab: (tab: NavTab) => void;
  refreshSignal: number;
}) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [cashJpy, setCashJpy] = useState(0);
  const [prices, setPrices] = useState<Map<string, StockMetrics>>(new Map());
  const [history, setHistory] = useState<PortfolioSnapshot[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [topPicks, setTopPicks] = useState<TopPick[]>([]);
  const [pickMarket, setPickMarket] = useState<"all" | ScreenMarket>("all");
  const [dailyPool, setDailyPool] = useState<DailyScreenEntry[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [previewItem, setPreviewItem] = useState<NewsItem | null>(null);
  const [tooltipAnchor, setTooltipAnchor] = useState<TooltipAnchor | null>(null);

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;

    async function load() {
      const [h, cash, hist, quotesRes, jpScan, usScan, newsRes] = await Promise.all([
        loadPortfolio(),
        loadCashJpy(),
        getHistory(),
        fetch("/api/quotes", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ quotes: [] })),
        fetch("/api/daily-screen/status?market=jp", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/daily-screen/status?market=us", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/news?market=jp", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ items: [] })),
      ]);
      if (cancelled) return;

      setHoldings(h);
      setCashJpy(cash);
      setHistory(hist);
      setQuotes(Array.isArray(quotesRes.quotes) ? quotesRes.quotes : []);
      setNews(Array.isArray(newsRes.items) ? newsRes.items.slice(0, 5) : []);

      const pool: DailyScreenEntry[] = [];
      const picks: TopPick[] = [];
      for (const [market, scan] of [["jp", jpScan] as const, ["us", usScan] as const]) {
        const state = scan as DailyScreenState | null;
        if (state?.status === "done") {
          pool.push(...state.results);
          for (const e of state.results) {
            const { score, grade } = computeOverallScore(e);
            picks.push({ ...e, overallScore: score, overallGrade: grade, market });
          }
        }
      }
      picks.sort((a, b) => b.overallScore - a.overallScore);
      setTopPicks(picks.slice(0, 30));
      setDailyPool(pool);

      if (h.length > 0) {
        const priceMap = await fetchMetricsBatch([...h.map((x) => x.ticker), "JPY=X"], { concurrency: 6 });
        if (!cancelled) setPrices(priceMap);
      } else {
        setPrices(new Map());
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [hidden, refreshSignal]);

  // 市場・為替カードの更新フラッシュ演出(QuoteRowView)は、値が実際に変わって初めて意味を
  // 持つ。上のload()はrefreshSignal変化時にしか呼ばれないため、ここだけ別に/api/quotesを
  // 20秒おき(サーバー側キャッシュのTTLと同じ)に取り直す軽量なポーリングを追加する
  // (ポートフォリオ・スキャン結果・ニュースまで含む重いload()全体を回す必要はないため)。
  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    const id = window.setInterval(() => {
      fetch("/api/quotes", { cache: "no-store" })
        .then((r) => r.json())
        .then((res) => {
          if (!cancelled && Array.isArray(res.quotes)) setQuotes(res.quotes);
        })
        .catch(() => {});
    }, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [hidden]);

  const rate = prices.get("JPY=X")?.price ?? quotes.find((q) => q.symbol === "JPY=X")?.price ?? 150;
  const toJpy = (amount: number, currency: string) => (currency === "JPY" ? amount : amount * rate);

  let totalValueJpy = 0;
  const sectorTotalsJpy: Record<string, number> = {};
  const currencyTotalsJpy: Record<string, number> = {};
  for (const h of holdings) {
    const m = prices.get(h.ticker);
    const price = m?.price ?? h.avgCost;
    const valueJpy = toJpy(price * h.shares, h.currency);
    totalValueJpy += valueJpy;
    const sector = m?.sector ?? "その他";
    sectorTotalsJpy[sector] = (sectorTotalsJpy[sector] ?? 0) + valueJpy;
    currencyTotalsJpy[h.currency] = (currencyTotalsJpy[h.currency] ?? 0) + valueJpy;
  }
  const sectorBreakdown = Object.entries(sectorTotalsJpy).map(([sector, value]) => ({
    sector,
    pct: totalValueJpy > 0 ? (value / totalValueJpy) * 100 : 0,
  }));
  const currencyBreakdown = Object.entries(currencyTotalsJpy).map(([currency, value]) => ({
    currency,
    pct: totalValueJpy > 0 ? (value / totalValueJpy) * 100 : 0,
  }));
  const positionBreakdown = holdings.map((h) => {
    const m = prices.get(h.ticker);
    const price = m?.price ?? h.avgCost;
    const valueJpy = toJpy(price * h.shares, h.currency);
    return { name: h.name, pct: totalValueJpy > 0 ? (valueJpy / totalValueJpy) * 100 : 0 };
  });
  const health = computePortfolioHealth(totalValueJpy, cashJpy, sectorBreakdown, currencyBreakdown, positionBreakdown);
  const healthAlerts = (health?.items ?? []).filter((i) => i.level !== "good");

  const priceByTicker = new Map(holdings.map((h) => [h.ticker, { price: prices.get(h.ticker)?.price ?? null, currency: prices.get(h.ticker)?.currency ?? null }]));
  const advice = dailyPool.length > 0 ? computePortfolioAdvice(dailyPool, holdings, priceByTicker, rate, cashJpy).advice : [];
  const managerAdvice = advice.find((a) => a.personaId === "manager");
  const buyCount = managerAdvice?.buys.length ?? 0;
  const sellCount = managerAdvice?.sells.length ?? 0;

  let totalPlJpy = 0;
  for (const h of holdings) {
    const m = prices.get(h.ticker);
    const price = m?.price ?? h.avgCost;
    totalPlJpy += toJpy((price - h.avgCost) * h.shares, h.currency);
  }
  const usdJpyQuote = quotes.find((q) => q.label === "ドル円");
  const nikkei = quotes.find((q) => q.label === "日経平均");
  const topix = quotes.find((q) => q.label === "TOPIX");
  const sp500 = quotes.find((q) => q.label === "S&P500");
  const nasdaq = quotes.find((q) => q.label === "NASDAQ");
  const nyDow = quotes.find((q) => q.label === "NYダウ");
  const vix = quotes.find((q) => q.label === "VIX");
  const sectorSegments = sectorBreakdown
    .slice()
    .sort((a, b) => b.pct - a.pct)
    .map((s) => ({ label: sectorLabelJa(s.sector), value: s.pct, color: sectorColor(s.sector) }));

  const { dayPct, monthPct } = computeAssetDeltas(history);
  const deltaParts: string[] = [];
  if (monthPct != null) deltaParts.push(`前月比 ${fmtPct(monthPct)}`);
  if (dayPct != null) deltaParts.push(`前日比 ${fmtPct(dayPct)}`);

  return (
    <section hidden={hidden} className="h-full">
      <GlassPageShell fitViewport showGlow={false}>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className={`${CARD} relative mb-2.5 shrink-0 overflow-hidden p-4`}
        >
          <motion.div
            aria-hidden
            className="glow-blob pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full blur-[80px]"
            style={{ background: "var(--glow)" }}
            animate={{ x: [0, -22, 10, 0], y: [0, 14, -10, 0], opacity: [0.24, 0.5, 0.32, 0.24] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />
          {history.length >= 2 && (
            <div className="pointer-events-none absolute inset-0">
              <AmbientChart history={history} />
            </div>
          )}
          <div className="relative flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-[11px]" style={{ color: GLASS_TEXT2 }}>
                  ダッシュボード
                </div>
                <h2 className="mt-0.5 text-[22px] font-extrabold" style={{ color: GLASS_TEXT }}>
                  {greeting()}
                </h2>
              </div>
              <span className="text-[11px]" style={{ color: GLASS_TEXT2 }}>
                {todayLabel()}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              <StatBlock
                value={totalValueJpy + cashJpy}
                format={(n) => `¥${fmt(n)}`}
                valueColor="var(--tone-1)"
                label="総資産(円換算)"
                onClick={() => onNavigateTab("portfolio")}
                deltaNode={
                  deltaParts.length > 0 ? (
                    <span className="text-[11px] font-semibold" style={{ color: GLASS_TEXT2 }}>
                      {deltaParts.join("・")}
                    </span>
                  ) : undefined
                }
              />
              <StatBlock value={cashJpy} format={(n) => `¥${fmt(n)}`} label="現金" onClick={() => onNavigateTab("portfolio")} />
              <StatBlock value={totalValueJpy} format={(n) => `¥${fmt(n)}`} label="評価額(株式)" onClick={() => onNavigateTab("portfolio")} />
              <StatBlock
                value={totalPlJpy}
                format={(n) => `${n >= 0 ? "+" : ""}¥${fmt(n)}`}
                valueColor={totalPlJpy > 0 ? GLASS_UP : totalPlJpy < 0 ? GLASS_DOWN : undefined}
                label="保有評価損益(本日)"
                onClick={() => onNavigateTab("portfolio")}
              />
            </div>
          </div>
        </motion.div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-3">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
            className={`${CARD} flex min-h-0 flex-col overflow-hidden p-0`}
          >
            <CardHeader icon={Wallet} iconColor="var(--accent)" title="保有銘柄" onNavigate={() => onNavigateTab("portfolio")} />
            {holdings.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-[11px]" style={{ color: GLASS_TEXT2 }}>
                保有銘柄がまだ登録されていません
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-3">
                {holdings.map((h) => {
                  const m = prices.get(h.ticker);
                  const price = m?.price ?? h.avgCost;
                  const plNative = (price - h.avgCost) * h.shares;
                  const plJpy = toJpy(plNative, h.currency);
                  const plPct = h.avgCost > 0 ? ((price - h.avgCost) / h.avgCost) * 100 : 0;
                  const up = plJpy > 0;
                  const down = plJpy < 0;
                  const earningsDays = daysUntilEarnings(m?.earningsDate);
                  const earningsSoon = earningsDays != null && earningsDays >= 0 && earningsDays <= 7;
                  return (
                    <button
                      key={h.id}
                      onClick={() => onOpenDetail(h.ticker, h.name)}
                      className="flex shrink-0 items-center gap-2 rounded-xl px-1.5 py-1.5 text-left transition hover:bg-black/[0.03]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-bold" style={{ color: GLASS_TEXT }}>
                          {h.name}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                            {h.shares}株
                          </span>
                          {earningsSoon && (
                            <span
                              className="shrink-0 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-1.5 py-0.5 text-[9px] font-bold"
                              style={{ color: "var(--accent-strong)" }}
                            >
                              決算{earningsDays === 0 ? "本日" : `${earningsDays}日後`}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className="shrink-0 text-[11px] font-bold tabular-nums"
                        style={{ color: up ? GLASS_UP : down ? GLASS_DOWN : "var(--text-muted)" }}
                      >
                        {plJpy >= 0 ? "+" : ""}¥{fmt(plJpy)} ({plPct >= 0 ? "+" : ""}
                        {plPct.toFixed(1)}%)
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.14, ease: "easeOut" }}
            className="flex min-h-0 flex-col gap-2.5 lg:col-span-2"
          >
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                onClick={() => onNavigateTab("portfolio")}
                className={`${CARD} flex min-h-0 flex-col gap-3 overflow-y-auto p-3.5 text-left transition hover:brightness-[0.98]`}
              >
                {healthAlerts.length > 0 && (
                  <div className="flex items-center gap-2 rounded-[8px] border border-red-300/70 bg-red-100/75 px-2.5 py-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#a32d2d]">
                      <AlertTriangle size={14} strokeWidth={2.5} className="text-white" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-extrabold leading-tight text-[var(--status-danger)]">要確認({healthAlerts.length}件)</div>
                      <div className="truncate text-[11px] leading-tight text-[var(--status-danger)]/85">{healthAlerts[0].message}</div>
                    </div>
                  </div>
                )}
                <SectorDonut
                  label="保有セクター別"
                  segments={sectorSegments}
                  centerValue={`¥${fmt(totalValueJpy)}`}
                  centerLabel="評価額"
                />
                <div className="h-px" style={{ background: GLASS_BORDER }} />
                <AllocationBarRow
                  label="ポートフォリオ比率"
                  segments={[
                    { label: "株式", value: Math.max(totalValueJpy, 0), color: "var(--tone-1)" },
                    { label: "現金", value: Math.max(cashJpy, 0), color: "var(--tone-4)" },
                  ]}
                />
              </button>

              <div className="flex min-h-0 flex-col gap-2">
                <motion.button
                  onClick={() => onNavigateTab("personas")}
                  className="relative flex min-w-0 flex-1 flex-col gap-3 overflow-hidden rounded-[10px] p-4 text-left shadow-[0_1px_2px_rgba(28,27,24,0.04)] transition-[filter] hover:brightness-110"
                  style={{ background: "#0a0c0e" }}
                >
                  <motion.div
                    aria-hidden
                    className="glow-blob pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-[var(--accent)]/25 blur-[56px]"
                    animate={{ x: [0, -10, 6, 0], y: [0, 8, -4, 0] }}
                    transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <div className="relative flex min-h-0 flex-1 flex-col">
                    <QuoteTerminal
                      rows={[
                        { label: "ドル円", price: usdJpyQuote?.price ?? null, format: (n) => `¥${n.toFixed(2)}`, changePercent: usdJpyQuote?.changePercent ?? null, changePercentMonth: usdJpyQuote?.changePercentMonth ?? null },
                        { label: "日経平均", price: nikkei?.price ?? null, format: fmt, changePercent: nikkei?.changePercent ?? null, changePercentMonth: nikkei?.changePercentMonth ?? null },
                        { label: "TOPIX", price: topix?.price ?? null, format: (n) => n.toFixed(1), changePercent: topix?.changePercent ?? null, changePercentMonth: topix?.changePercentMonth ?? null },
                        { label: "S&P500", price: sp500?.price ?? null, format: fmt, changePercent: sp500?.changePercent ?? null, changePercentMonth: sp500?.changePercentMonth ?? null },
                        { label: "NASDAQ", price: nasdaq?.price ?? null, format: fmt, changePercent: nasdaq?.changePercent ?? null, changePercentMonth: nasdaq?.changePercentMonth ?? null },
                        { label: "NYダウ", price: nyDow?.price ?? null, format: fmt, changePercent: nyDow?.changePercent ?? null, changePercentMonth: nyDow?.changePercentMonth ?? null },
                        { label: "VIX", price: vix?.price ?? null, format: (n) => n.toFixed(2), changePercent: vix?.changePercent ?? null, changePercentMonth: vix?.changePercentMonth ?? null },
                      ]}
                    />
                  </div>
                </motion.button>

                <LiveNewsTicker items={news} onSelect={setPreviewItem} />
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className={`${CARD} flex min-h-0 flex-col overflow-hidden p-0`}>
                <CardHeader icon={TrendingUp} iconColor={GLASS_TEXT2} title="アドバイザーの推奨銘柄" onNavigate={() => onNavigateTab("personas")} />
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 pt-0">
                  {buyCount === 0 && sellCount === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-[8px] border border-dashed p-2.5 text-center text-[11px]" style={{ borderColor: GLASS_BORDER, color: "var(--text-muted)" }}>
                      推奨はありません
                    </div>
                  ) : (
                    <>
                      <div className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                        買い推奨
                      </div>
                      {buyCount === 0 && (
                        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          なし
                        </div>
                      )}
                      {managerAdvice?.buys.slice(0, 4).map((b, i) => (
                        <button
                          key={`buy-${b.ticker}`}
                          onClick={() => onOpenDetail(b.ticker, b.name ?? b.ticker)}
                          onMouseEnter={(e) => setTooltipAnchor({ rect: e.currentTarget.getBoundingClientRect(), reason: b.reason, detail: b.detail })}
                          onMouseLeave={() => setTooltipAnchor(null)}
                          className={`flex flex-1 items-center gap-2.5 ${HERO_ITEM}`}
                          style={{ background: "var(--gradient-hero)" }}
                        >
                          {i === 0 && <ShineSweep />}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12.5px] font-bold" style={{ color: GLASS_TEXT }}>
                              {b.name ?? b.ticker}
                            </div>
                            <div className="font-mono text-[11px]" style={{ color: GLASS_TEXT2 }}>
                              {b.ticker}
                            </div>
                          </div>
                        </button>
                      ))}
                      <div className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                        売り推奨
                      </div>
                      {sellCount === 0 && (
                        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          なし
                        </div>
                      )}
                      {managerAdvice?.sells.slice(0, 4).map((s) => (
                        <button
                          key={`sell-${s.ticker}`}
                          onClick={() => onOpenDetail(s.ticker, s.name ?? s.ticker)}
                          onMouseEnter={(e) => setTooltipAnchor({ rect: e.currentTarget.getBoundingClientRect(), reason: s.reason, detail: s.detail })}
                          onMouseLeave={() => setTooltipAnchor(null)}
                          className={`flex flex-1 items-center gap-2.5 ${FLAT_ITEM}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12.5px] font-bold" style={{ color: GLASS_TEXT }}>
                              {s.name ?? s.ticker}
                            </div>
                            <div className="font-mono text-[11px]" style={{ color: GLASS_TEXT2 }}>
                              {s.ticker}
                            </div>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>

              <div className={`${CARD} flex min-h-0 flex-col overflow-hidden p-0`}>
                <CardHeader icon={Star} iconColor="var(--accent-strong)" title="本日の注目銘柄" onNavigate={() => onNavigateTab("dailypicks")} />
                <div className="flex shrink-0 gap-1 px-2 pb-1.5">
                  {(
                    [
                      { key: "all", label: "すべて" },
                      { key: "jp", label: "日本株" },
                      { key: "us", label: "米国株" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setPickMarket(m.key)}
                      className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition"
                      style={
                        pickMarket === m.key
                          ? { background: "var(--accent)", color: "#ffffff" }
                          : { background: "rgba(0,0,0,0.04)", color: GLASS_TEXT2 }
                      }
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 pt-0">
                  {(() => {
                    const filteredPicks = (pickMarket === "all" ? topPicks : topPicks.filter((p) => p.market === pickMarket)).slice(0, 2);
                    if (filteredPicks.length === 0) {
                      return (
                        <div className="flex flex-1 items-center justify-center rounded-[8px] border border-dashed p-2.5 text-center text-[11px]" style={{ borderColor: GLASS_BORDER, color: "var(--text-muted)" }}>
                          本日分のスキャン待ち
                        </div>
                      );
                    }
                    return filteredPicks.map((pick, i) => (
                      <button
                        key={`${pick.market}-${pick.ticker}`}
                        onClick={() => onOpenDetail(pick.ticker, pick.name ?? pick.ticker)}
                        className={i === 0 ? `flex flex-1 items-center gap-2.5 ${HERO_ITEM}` : `flex flex-1 items-center gap-2.5 ${FLAT_ITEM}`}
                        style={i === 0 ? { background: "var(--gradient-hero)" } : undefined}
                      >
                        {i === 0 && <ShineSweep />}
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                            {i + 1}位
                          </div>
                          <div className="truncate text-[12.5px] font-bold" style={{ color: GLASS_TEXT }}>
                            {pick.name ?? pick.ticker}
                          </div>
                          <div className="font-mono text-[11px]" style={{ color: GLASS_TEXT2 }}>
                            {pick.ticker}
                          </div>
                        </div>
                        <OverallScoreBadge
                          score={pick.overallScore}
                          grade={pick.overallGrade}
                          breakdown={{
                            minerviniScore: pick.minerviniScore,
                            canslimScore: pick.canslimScore,
                            qualityScore: pick.qualityScore,
                            qualityTotal: pick.qualityTotal,
                            committeeAgree: pick.committeeAgree,
                            committeeTotal: pick.committeeTotal,
                            committeeRoles: pick.committeeRoles,
                          }}
                        />
                      </button>
                    ));
                  })()}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </GlassPageShell>
      <AdviceTooltip anchor={tooltipAnchor} />
      <AnimatePresence>
        {previewItem && (
          <NewsPreviewModal
            key={previewItem.link}
            item={previewItem}
            title={previewItem.title}
            description={previewItem.description}
            onClose={() => setPreviewItem(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
