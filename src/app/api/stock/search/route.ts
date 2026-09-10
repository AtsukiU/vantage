import { NextRequest, NextResponse } from "next/server";
import { searchStocks } from "@/lib/stockSearch";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }

  try {
    const results = await searchStocks(q);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Failed to search stocks", error);
    return NextResponse.json({ error: "検索に失敗しました" }, { status: 502 });
  }
}
