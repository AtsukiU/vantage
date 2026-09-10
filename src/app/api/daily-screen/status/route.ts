import { NextRequest, NextResponse } from "next/server";
import { getDailyScreenState, type ScreenMarket } from "@/lib/dailyScreenStore";

export const revalidate = 0;

// 本日の注目銘柄スキャンの進捗・結果を返す。実行中はフロントエンドがこれをポーリングする。
export async function GET(req: NextRequest) {
  const marketParam = req.nextUrl.searchParams.get("market");
  const market: ScreenMarket = marketParam === "us" ? "us" : "jp";
  const state = await getDailyScreenState(market);
  return NextResponse.json(state);
}
