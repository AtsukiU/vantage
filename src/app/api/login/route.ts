import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_MAX_AGE,
  AUTH_COOKIE_NAME,
  expectedAuthCookieValue,
  isCorrectPassword,
} from "@/lib/authCookie";

export async function POST(req: NextRequest) {
  const expected = expectedAuthCookieValue();
  if (!expected) {
    // APP_PASSWORD未設定(ゲート無効)。ログイン自体不要なので成功扱いにする。
    return NextResponse.json({ ok: true });
  }

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password) {
    return NextResponse.json({ error: "パスワードを入力してください" }, { status: 400 });
  }
  if (!isCorrectPassword(password)) {
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
  return res;
}
