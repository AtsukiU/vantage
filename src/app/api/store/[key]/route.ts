import { NextRequest, NextResponse } from "next/server";
import { getJson, setJson, isKvConfigured } from "@/lib/kv";

export const revalidate = 0;

// クライアント側のlocalStorageストア(portfolioStore.ts等)を複数ブラウザ/端末間で
// 同期するための汎用エンドポイント。Redisの`user-data:{key}`キーにJSONを1つ丸ごと
// 保存/取得するだけの薄いプロキシ(Upstashの認証情報をブラウザに渡さないための経由地)。
// 任意のキーを書き込めてしまわないよう、実際に使う値だけを許可リストにしている。
const ALLOWED_KEYS = new Set([
  "portfolio",
  "portfolio-cash",
  "watchlist",
  "portfolio-history",
  "portfolio-trades",
  "position-sizing-prefs",
]);

function kvKey(key: string): string {
  return `user-data:${key}`;
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/store/[key]">
) {
  const { key } = await ctx.params;
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: "不明なキーです" }, { status: 400 });
  }
  if (!isKvConfigured()) {
    // Upstash未設定時は「値なし」を返す(呼び出し元はlocalStorageへフォールバックする)。
    return NextResponse.json({ value: null, configured: false });
  }
  try {
    const value = await getJson<unknown>(kvKey(key));
    return NextResponse.json({ value, configured: true });
  } catch (error) {
    console.error(`Failed to read store key "${key}"`, error);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 502 });
  }
}

export async function PUT(
  req: NextRequest,
  ctx: RouteContext<"/api/store/[key]">
) {
  const { key } = await ctx.params;
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: "不明なキーです" }, { status: 400 });
  }
  if (!isKvConfigured()) {
    return NextResponse.json({ ok: false, configured: false });
  }
  try {
    const body = await req.json();
    await setJson(kvKey(key), body);
    return NextResponse.json({ ok: true, configured: true });
  } catch (error) {
    console.error(`Failed to write store key "${key}"`, error);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 502 });
  }
}
