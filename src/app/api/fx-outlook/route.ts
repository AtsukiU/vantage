import { NextResponse } from "next/server";
import { fetchFxOutlook } from "@/lib/fxOutlook";

export const revalidate = 0;

export async function GET() {
  const outlook = await fetchFxOutlook();
  if (!outlook) {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
  return NextResponse.json(outlook);
}
