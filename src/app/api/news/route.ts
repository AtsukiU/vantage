import { NextRequest, NextResponse } from "next/server";
import { fetchMarketNews, withinHours } from "@/lib/news";
import type { Market } from "@/lib/feeds";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  const market = req.nextUrl.searchParams.get("market");
  if (market !== "jp" && market !== "us") {
    return NextResponse.json(
      { error: "market must be 'jp' or 'us'" },
      { status: 400 }
    );
  }

  try {
    const all = await fetchMarketNews(market as Market);
    const items = withinHours(all, 24);
    return NextResponse.json({
      market,
      updatedAt: new Date().toISOString(),
      count: items.length,
      items,
    });
  } catch (error) {
    console.error("Failed to fetch news", error);
    return NextResponse.json(
      { error: "ニュースの取得に失敗しました" },
      { status: 502 }
    );
  }
}
