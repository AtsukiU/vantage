import { NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/quotes";

export const revalidate = 0;

export async function GET() {
  try {
    const quotes = await fetchQuotes();
    return NextResponse.json({ updatedAt: new Date().toISOString(), quotes });
  } catch (error) {
    console.error("Failed to fetch quotes", error);
    return NextResponse.json(
      { error: "指数情報の取得に失敗しました" },
      { status: 502 }
    );
  }
}
