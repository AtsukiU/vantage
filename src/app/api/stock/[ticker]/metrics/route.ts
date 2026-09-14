import { NextRequest, NextResponse } from "next/server";
import { fetchStockMetrics } from "@/lib/stockMetrics";
import { analyzeStock } from "@/lib/stockInsights";
import { fetchSparkline } from "@/lib/stockChart";
import { computeStockScores } from "@/lib/computeStockScores";

export const revalidate = 0;

// スクリーニング・ポートフォリオなど、大量の銘柄の現在値/財務指標だけを
// 軽量に取りたい画面向けのエンドポイント。チャート全履歴やテクニカル分析は含めない
// (/api/stock/[ticker] は個別銘柄の詳細ページ用でそれらも含めて返す、重い方)。
// ?sparkline=1 を付けるとスクリーニング結果カードのミニチャート用に直近3ヶ月の終値も返す。
// ?scores=1 を付けるとミネルヴィニ/CANSLIM/財務健全性/投資委員会各役のスコア(スクリーニングの
// 条件に使う)もあわせて計算する。追加のYahoo Finance呼び出しを伴うため、必要な画面だけが付ける。
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/stock/[ticker]/metrics">
) {
  const { ticker } = await ctx.params;
  const withSparkline = req.nextUrl.searchParams.get("sparkline") === "1";
  const withScores = req.nextUrl.searchParams.get("scores") === "1";

  try {
    if (withScores) {
      const [scores, sparkline] = await Promise.all([
        computeStockScores(ticker),
        withSparkline ? fetchSparkline(ticker).catch(() => []) : Promise.resolve(undefined),
      ]);

      if (scores.metrics.error) {
        return NextResponse.json({ error: "銘柄データが見つかりませんでした" }, { status: 404 });
      }

      return NextResponse.json({
        metrics: {
          ...scores.metrics,
          minerviniScore: scores.minerviniScore,
          canslimScore: scores.canslimScore,
          qualityScore: scores.qualityScore,
          qualityTotal: scores.qualityTotal,
          fundamentalRoleScore: scores.fundamentalRoleScore,
          sentimentRoleScore: scores.sentimentRoleScore,
          macroRoleScore: scores.macroRoleScore,
          committeeScore: scores.committeeAgree,
          committeeTotal: scores.committeeTotal,
          committeeRoles: scores.committeeRoles,
        },
        insights: analyzeStock(scores.metrics),
        sparkline,
      });
    }

    const [metrics, sparkline] = await Promise.all([
      fetchStockMetrics(ticker),
      withSparkline ? fetchSparkline(ticker).catch(() => []) : Promise.resolve(undefined),
    ]);

    if (metrics.error) {
      return NextResponse.json({ error: "銘柄データが見つかりませんでした" }, { status: 404 });
    }

    return NextResponse.json({
      metrics: {
        ...metrics,
        minerviniScore: null,
        canslimScore: null,
        qualityScore: null,
        qualityTotal: null,
        fundamentalRoleScore: null,
        sentimentRoleScore: null,
        macroRoleScore: null,
        committeeScore: null,
        committeeTotal: null,
        committeeRoles: null,
      },
      insights: analyzeStock(metrics),
      sparkline,
    });
  } catch (error) {
    console.error("Failed to fetch stock metrics", error);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 502 });
  }
}
