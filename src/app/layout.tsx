import type { Metadata, Viewport } from "next";
import { Geist_Mono, M_PLUS_Rounded_1c } from "next/font/google";
import "./globals.css";

// 参考にしたダッシュボードUIの「丸みのある柔らかい」書体の雰囲気に寄せるため、
// 日本語グリフも含む丸ゴシック系フォントに変更(以前のGeist Sansは角が立った事務的な印象だった)。
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#c9962f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${roundedSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col overflow-hidden bg-[#f2ead2]">
        {children}
      </body>
    </html>
  );
}
