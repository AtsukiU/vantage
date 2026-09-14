import type { MetadataRoute } from "next";

// 「ホーム画面に追加/アプリとしてインストール」を可能にするWeb App Manifest。
// スタンドアロン表示(アドレスバー無し)にすることで、ブラウザタブを毎回開き直す
// より起動が速く感じられ、見た目もアプリらしくなる。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VANTAGE",
    short_name: "VANTAGE",
    description: "日本株・米国株のニュース・スクリーニング・投資委員会分析をまとめた投資リサーチアプリ",
    start_url: "/",
    display: "standalone",
    background_color: "#eef3f5",
    theme_color: "#0891b2",
    icons: [
      { src: "/icon1", sizes: "192x192", type: "image/png" },
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/icon1", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
