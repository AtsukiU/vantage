import { NextRequest, NextResponse } from "next/server";
import { fetchStockMetrics } from "@/lib/stockMetrics";
import { fetchStockNews } from "@/lib/stockNews";

export const revalidate = 0;

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/stock/[ticker]/news">
) {
  const { ticker } = await ctx.params;
  const nameParam = req.nextUrl.searchParams.get("name");

  try {
    const name = nameParam ?? (await fetchStockMetrics(ticker)).name;
    const items = await fetchStockNews(ticker, name);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Failed to fetch stock news", error);
    return NextResponse.json({ error: "ニュースの取得に失敗しました" }, { status: 502 });
  }
}
