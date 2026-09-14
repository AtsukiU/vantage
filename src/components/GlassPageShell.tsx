"use client";

import type { ReactNode } from "react";

// 銘柄検索・スクリーニング・ポートフォリオで共通の背景(淡いぼかしメッシュ)
// +中央寄せラッパー。ガラス×インフォグラフィック型のデザインを全タブで統一するための共通シェル。
//
// fitViewport=true: xl以上(13インチ級ノートPCの実効幅=1280px相当を想定)の画面ではページ全体を
// スクロールさせず高さにきっちり収める(ダッシュボード用)。中身側はflex-colで組み、はみ出しそうな
// 部分だけ個別にoverflow-y-autoを付ける想定。xl未満(タブレット・モバイル・それより狭いノートPC)では
// 詰め込みきれないため、通常のページスクロールにフォールバックする
// (<main>側もこの時だけoverflow-y-autoに戻している。page.tsx参照)。
export function GlassPageShell({
  children,
  // 以前はタブごとにmax-w-4xl〜7xlとバラバラで、左右の余白の感じ方が画面によって
  // 違っていた。全タブで統一感を出すため既定値を1つに揃え、各タブ側の個別指定も撤去した
  // (呼び出し元でmaxWidthを渡さなくても常にこの値になる)。
  maxWidth = "max-w-7xl",
  fitViewport = false,
  // 以前は既定でtrue(全タブに角の光暈が付いていた)。ダッシュボードは既に独自のアンビエント
  // 演出(ヒーローカードの推移グラフ+アクセント光暈)を持っているため個別にfalseへ上書きして
  // いたが、他タブ側の光暈は不要という判断になったため、既定値自体をfalseにする
  // (ダッシュボード側のshowGlow={false}指定はそのままで問題ない)。
  showGlow = false,
  background = "bg-[var(--background)]",
}: {
  children: ReactNode;
  maxWidth?: string;
  fitViewport?: boolean;
  // ページ背景の装飾的なぼかし光暈。既定はfalse(全タブでフラットな見た目に統一)。
  // 必要な画面だけtrueで個別に有効化する。
  showGlow?: boolean;
  // ページ背景色のTailwindクラス。既定はテーマの暖色クリーム(--background)だが、
  // 「web appらしいニュートラル配色」を試す画面ではこれを上書きする(DashboardTab参照)。
  background?: string;
}) {
  return (
    <div className={`relative ${background} ${fitViewport ? "min-h-full lg:h-full lg:overflow-hidden" : "min-h-full overflow-hidden"}`}>
      {showGlow && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="glow-blob absolute -bottom-72 -right-72 h-[820px] w-[820px] rounded-full bg-[var(--glow)] opacity-[0.20] blur-[110px]" />
        </div>
      )}
      <div
        className={`relative mx-auto w-full ${maxWidth} 2xl:max-w-[1700px] px-3 pt-3 pb-2.5 sm:px-8 sm:pt-8 sm:pb-4 lg:px-10 lg:pt-10 ${
          // lg:max-h-[880px]は「13インチ級ノートPCならこの高さで収まるはず」という想定に
          // 過ぎない。中身が増えて実際にこの高さを超えた時、以前はlg:overflow-hidden(親側)
          // で問答無用に切り取ってしまい、画面外に出た部分が二度と見えなくなっていた。
          // ここにlg:overflow-y-autoを付けて、想定を超えた分はこの枠内でスクロールして
          // 見られるようにする(はみ出す=即データが見えなくなる、という状態を避ける)。
          fitViewport ? "lg:flex lg:h-full lg:max-h-[880px] lg:min-h-0 lg:flex-col lg:overflow-y-auto 2xl:max-h-[1150px]" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}
