import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, expectedAuthCookieValue } from "@/lib/authCookie";

// 公開URLとしてデプロイした場合の簡易パスワードゲート。APP_PASSWORD環境変数が
// 未設定ならゲートなし(ローカル開発時はこのままアクセスできる)。
export function proxy(request: NextRequest) {
  const expected = expectedAuthCookieValue();
  if (!expected) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (cookie === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
