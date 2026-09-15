import { NextRequest, NextResponse } from "next/server";
import { startDailyScreen, type ScreenMarket } from "@/lib/dailyScreenStore";

export const revalidate = 0;

// 東証プライム・スタンダード市場(jp、約3,100社)またはS&P500(us、約500社)の本日分フルスキャンを開始する。
// 既に本日分が実行中/完了済みなら何もしない(?force=1で完了済みでも破棄して再スキャン)。
// 処理自体は数分かかるため、このエンドポイントはバックグラウンドで開始した直後の状態を返して
// すぐ応答する(進捗はGET /api/daily-screen/statusをポーリングして確認する)。
export async function POST(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "1";
  const marketParam = req.nextUrl.searchParams.get("market");
  const market: ScreenMarket = marketParam === "us" ? "us" : "jp";
  const state = await startDailyScreen(market, force);
  return NextResponse.json(state);
}
