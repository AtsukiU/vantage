"use client";

import { GlassPageShell } from "../GlassPageShell";
import { StockSearchBar } from "./StockSearchBar";
import { StockDetailView } from "./StockDetailView";

export interface StockSelection {
  symbol: string;
  name: string;
}

interface StockTabProps {
  hidden: boolean;
  selection: StockSelection | null;
  onSelectionChange: (selection: StockSelection) => void;
}

export function StockTab({ hidden, selection, onSelectionChange }: StockTabProps) {
  return (
    <section hidden={hidden} className="h-full">
      <GlassPageShell>
        <StockSearchBar onSelect={(symbol, name) => onSelectionChange({ symbol, name })} />

        {selection ? (
          <StockDetailView
            key={selection.symbol}
            symbol={selection.symbol}
            name={selection.name}
            onOpenDetail={(symbol, name) => onSelectionChange({ symbol, name })}
          />
        ) : (
          <div className="rounded-[18px] border border-dashed border-[var(--border-subtle)] bg-white/60 p-10 text-center text-[12.5px] text-[var(--text-secondary)]">
            ティッカーまたは銘柄名で検索してください(例: 7203.T、トヨタ、AAPL、GLD、CL=Fなど)
          </div>
        )}
      </GlassPageShell>
    </section>
  );
}
