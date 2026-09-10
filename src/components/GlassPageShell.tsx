"use client";

import type { ReactNode } from "react";

// 銘柄検索・スクリーニング・ポートフォリオ・シミュレーターで共通の背景(淡いぼかしメッシュ)
// +中央寄せラッパー。ガラス×インフォグラフィック型のデザインを全タブで統一するための共通シェル。
//
// fitViewport=true: xl以上(13インチ級ノートPCの実効幅=1280px相当を想定)の画面ではページ全体を
// スクロールさせず高さにきっちり収める(ダッシュボード用)。中身側はflex-colで組み、はみ出しそうな
// 部分だけ個別にoverflow-y-autoを付ける想定。xl未満(タブレット・モバイル・それより狭いノートPC)では
// 詰め込みきれないため、通常のページスクロールにフォールバックする
// (<main>側もこの時だけoverflow-y-autoに戻している。page.tsx参照)。
export function GlassPageShell({
  children,
  maxWidth = "max-w-5xl",
  fitViewport = false,
}: {
  children: ReactNode;
  maxWidth?: string;
  fitViewport?: boolean;
}) {
  return (
    <div className={`relative bg-[#f2ead2] ${fitViewport ? "min-h-full lg:h-full lg:overflow-hidden" : "min-h-full overflow-hidden"}`}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -bottom-72 -right-72 h-[820px] w-[820px] rounded-full bg-[#f5c84c] opacity-[0.20] blur-[110px]" />
      </div>
      <div
        className={`relative mx-auto w-full ${maxWidth} px-4 py-4 ${
          fitViewport ? "lg:flex lg:h-full lg:max-h-[880px] lg:min-h-0 lg:flex-col lg:justify-center" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}
