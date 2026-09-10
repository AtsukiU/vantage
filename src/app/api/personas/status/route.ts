import { NextResponse } from "next/server";
import { getPersonasState } from "@/lib/personaStore";

export const revalidate = 0;

// 運用者シミュレーションの現在の状態を返すだけ(自動では判断を行わない)。
// 判断の実行はPOST /api/personas/runをユーザーがボタンを押した時に呼ぶ。
export async function GET() {
  const state = await getPersonasState();
  return NextResponse.json(state);
}
