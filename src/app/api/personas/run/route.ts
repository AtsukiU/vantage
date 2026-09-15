import { NextRequest, NextResponse } from "next/server";
import { runPersonasNow } from "@/lib/personaStore";
import type { PersonaStyle } from "@/lib/personaDefs";

export const revalidate = 0;

// 「運用者」タブのボタンから呼ばれる。1日1回の自動判断ではなく、押すたびに
// 現時点の「本日の注目銘柄」データを使って全パーソナの決済・エントリー判定をやり直す。
// 本日分のスキャン(JP/US)が両方完了していない場合は判断を行わず、その旨を返す。
// bodyに{ style: "value" | "growth" }を渡すと、統括マネージャーの合議から対立スタイルを除外する。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}) as { style?: PersonaStyle });
  const style = body?.style === "value" || body?.style === "growth" ? body.style : null;
  const result = await runPersonasNow(style);
  if (!result.ok) {
    return NextResponse.json(
      { error: "本日の注目銘柄のスキャン(日本株・米国株)が両方完了していないため、まだ判断できません。", state: result.state },
      { status: 409 }
    );
  }
  return NextResponse.json(result.state);
}
