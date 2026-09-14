import { ImageResponse } from "next/og";

// アプリのアイコン(ブラウザタブ・PWAインストール時の大きい方の1つ)。
// サイドバーの「V」ロゴマークと同じ配色(アクセントカラー地に白いV)で統一する。
// テーマは複数あるが、アイコン自体は既定のシアンで固定する(アイコンだけ動的に
// 切り替えるのは技術的に難しく、ブランドとしても1色に固定した方が分かりやすいため)。
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0891b2",
        }}
      >
        <span style={{ fontSize: 300, fontWeight: 800, color: "#ffffff" }}>V</span>
      </div>
    ),
    { ...size }
  );
}
