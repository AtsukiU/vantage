import { NextRequest, NextResponse } from "next/server";
import { runTrendBacktest } from "@/lib/trendBacktest";

export const revalidate = 0;

// 過去5年の株価データだけを使ったトレンドフォロー戦略のバックテスト(trendBacktest.ts参照)。
// 銘柄一覧はクライアント側(保有銘柄/ウォッチリスト)から渡してもらう。
export async function GET(req: NextRequest) {
  const tickersParam = req.nextUrl.searchParams.get("tickers");
  if (!tickersParam) {
    return NextResponse.json({ error: "tickersが指定されていません" }, { status: 400 });
  }
  const tickers = tickersParam
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 30);
  if (tickers.length === 0) {
    return NextResponse.json({ error: "有効な銘柄がありません" }, { status: 400 });
  }

  try {
    const result = await runTrendBacktest(tickers);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to run trend backtest", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "バックテストに失敗しました" }, { status: 502 });
  }
}
