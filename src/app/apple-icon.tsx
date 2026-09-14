import { ImageResponse } from "next/og";

// iOSの「ホーム画面に追加」用アイコン(180x180がApple推奨サイズ)。
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        <span style={{ fontSize: 108, fontWeight: 800, color: "#ffffff" }}>V</span>
      </div>
    ),
    { ...size }
  );
}
