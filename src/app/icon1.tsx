import { ImageResponse } from "next/og";

// manifest.tsのicons配列で使う192x192版(Android「ホーム画面に追加」の推奨サイズ)。
// icon.tsx(512x512)と同じ見た目をサイズ違いで書き出す。
export const size = { width: 192, height: 192 };
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
        <span style={{ fontSize: 112, fontWeight: 800, color: "#ffffff" }}>V</span>
      </div>
    ),
    { ...size }
  );
}
