import type { Metadata, Viewport } from "next";
import { Geist_Mono, M_PLUS_Rounded_1c } from "next/font/google";
import "./globals.css";
import { ThemeInit } from "@/components/settings/ThemeInit";
import { ModeInit } from "@/components/settings/ModeInit";

// 参考にしたダッシュボードUIの「丸みのある柔らかい」書体の雰囲気に寄せるため、
// 日本語グリフも含む丸ゴシック系フォントに変更(以前のGeist Sansは角が立った事務的な印象だった)。
// 全テーマ・全見出し共通で使う(テーマごとに見出しフォントを変える案は試したが、
// 統一感を優先してフォントは1種類のままにする方針にした)。
const roundedSans = M_PLUS_Rounded_1c({
  variable: "--font-geist-sans",
  weight: ["400", "500", "700", "800"],
  subsets: ["latin"],
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VANTAGE",
  description: "日本株・米国株のニュース・スクリーニング・投資委員会分析をまとめた投資リサーチアプリ",
};

// ブラウザのアドレスバー等の色。CSS変数は使えないため固定値(シアンテーマの既定色)を
// 埋め込み、テーマ切替時の追従はThemeInit側でmeta[name=theme-color]を直接書き換える。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0891b2",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${roundedSans.variable} ${geistMono.variable} h-dvh antialiased`}>
      <body className="h-dvh flex flex-col overflow-hidden bg-[var(--background)]">
        <ThemeInit />
        <ModeInit />
        {children}
      </body>
    </html>
  );
}
