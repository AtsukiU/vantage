import { NextResponse } from "next/server";
import { runPersonasNow } from "@/lib/personaStore";

export const revalidate = 0;

// 「運用者」タブのボタンから呼ばれる。1日1回の自動判断ではなく、押すたびに
// 現時点の「本日の注目銘柄」データを使って全パーソナの決済・エントリー判定をやり直す。
// 本日分のスキャン(JP/US)が両方完了していない場合は判断を行わず、その旨を返す。
export async function POST() {
  const result = await runPersonasNow();
  if (!result.ok) {
    return NextResponse.json(
      { error: "本日の注目銘柄のスキャン(日本株・米国株)が両方完了していないため、まだ判断できません。", state: result.state },
      { status: 409 }
    );
  }
  return NextResponse.json(result.state);
}
