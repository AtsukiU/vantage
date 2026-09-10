"use client";

import { GlassPageShell } from "../GlassPageShell";
import { StockSearchBar } from "./StockSearchBar";
import { StockDetailView } from "./StockDetailView";
import { Coins, DollarSign, Fuel, type LucideIcon } from "lucide-react";

export interface StockSelection {
  symbol: string;
  name: string;
}

interface StockTabProps {
  hidden: boolean;
  selection: StockSelection | null;
  onSelectionChange: (selection: StockSelection) => void;
}

// 株式以外(コモディティ・為替)はティッカー表記が分かりにくいため、ワンクリックで
// 開けるショートカットを用意しておく。
const QUICK_LINKS: { label: string; symbol: string; name: string; icon: LucideIcon }[] = [
  { label: "金(GLD)", symbol: "GLD", name: "SPDR Gold Shares", icon: Coins },
  { label: "銀(SLV)", symbol: "SLV", name: "iShares Silver Trust", icon: Coins },
  { label: "国内金ETF", symbol: "1540.T", name: "純金上場信託", icon: Coins },
  { label: "ドル円", symbol: "JPY=X", name: "USD/JPY", icon: DollarSign },
  { label: "原油", symbol: "CL=F", name: "WTI原油先物", icon: Fuel },
];

export function StockTab({ hidden, selection, onSelectionChange }: StockTabProps) {
  return (
    <section hidden={hidden}>
      <GlassPageShell>
        <StockSearchBar onSelect={(symbol, name) => onSelectionChange({ symbol, name })} />

        <div className="mb-4 flex flex-wrap gap-2">
          {QUICK_LINKS.map((q) => (
            <button
              key={q.symbol}
              onClick={() => onSelectionChange({ symbol: q.symbol, name: q.name })}
              className="flex items-center gap-1.5 rounded-full border border-[#e2dfd2] bg-white/70 px-3 py-1 text-xs text-[#6c6656] transition hover:border-[#c9962f]/40 hover:text-[#c9962f]"
            >
              <q.icon size={13} strokeWidth={2.25} />
              {q.label}
            </button>
          ))}
        </div>

        {selection ? (
          <StockDetailView
            key={selection.symbol}
            symbol={selection.symbol}
            name={selection.name}
            onOpenDetail={(symbol, name) => onSelectionChange({ symbol, name })}
          />
        ) : (
          <div className="rounded-[18px] border border-dashed border-[#e2dfd2] bg-white/60 p-10 text-center text-[13px] text-[#6c6656]">
            ティッカーまたは銘柄名で検索してください(例: 7203.T、トヨタ、AAPL、または上のコモディティ)
          </div>
        )}
      </GlassPageShell>
    </section>
  );
}
