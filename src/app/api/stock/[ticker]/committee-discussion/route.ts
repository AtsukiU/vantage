import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const revalidate = 0;

// 投資委員会の「議論」をClaudeに生成させるエンドポイント。個別銘柄の詳細ページから、
// ユーザーがボタンを押した時だけ呼ばれる(スクリーニングでは呼ばない=銘柄数が多いと
// 遅い・高くつくため、ルールベースのスコアだけで済ませている)。
// ANTHROPIC_API_KEY が .env.local に設定されていない場合は明確なエラーを返す。

interface CommitteeRequestBody {
  ticker: string;
  name: string | null;
  sector: string | null;
  price: number | null;
  currency: string | null;
  per: number | null;
  pbr: number | null;
  roe: number | null;
  dividendYield: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  grahamNumber: number | null;
  targetMeanPrice: number | null;
  recommendationKey: string | null;
  minerviniScore: number | null;
  minerviniTotal: number | null;
  rsi14: number | null;
  pctFromWeek52High: number | null;
  netInstitutionalBuyingPercent: number | null;
  analystUpgrades90d: number | null;
  analystDowngrades90d: number | null;
  earningsBeatStreak: number | null;
  fundamentalRoleScore: number | null;
  sentimentRoleScore: number | null;
  macroRoleScore: number | null;
  committeeAgree: number | null;
  committeeTotal: number | null;
}

const MODEL = process.env.CLAUDE_COMMITTEE_MODEL ?? "claude-haiku-4-5";

function buildPrompt(d: CommitteeRequestBody): string {
  return `あなたは証券会社の投資委員会の議長です。ファンダメンタル役・テクニカル役・センチメント役・リスク管理役・マクロ役の5人(保有ポートフォリオがあればPM役も参考意見として同席)がそれぞれの視点で銘柄「${d.name ?? d.ticker}」(${d.ticker})を検討し終えた、という設定です。以下の実データ(すべて実在の指標、捏造しないこと)をもとに、議論を踏まえた最終結論だけを出してください(各役の個別発言は不要、結論のみ)。

【データ】
現在値: ${d.price ?? "不明"} ${d.currency ?? ""}
セクター: ${d.sector ?? "不明"}
PER: ${d.per ?? "算出不可"}倍 / PBR: ${d.pbr ?? "算出不可"}倍 / ROE: ${d.roe ?? "不明"}% / 配当利回り: ${d.dividendYield ?? "無配または不明"}%
売上成長率: ${d.revenueGrowth ?? "不明"}% / 利益成長率: ${d.earningsGrowth ?? "不明"}%
グレアムナンバー(目安株価): ${d.grahamNumber ?? "算出不可"}
アナリスト目標株価平均: ${d.targetMeanPrice ?? "不明"}(推奨: ${d.recommendationKey ?? "不明"})
ミネルヴィニ・トレンドテンプレート: ${d.minerviniScore ?? "不明"}/${d.minerviniTotal ?? "?"}点
RSI(14): ${d.rsi14 ?? "不明"} / 52週高値からの乖離: ${d.pctFromWeek52High ?? "不明"}%
機関投資家の6ヶ月保有増減: ${d.netInstitutionalBuyingPercent ?? "不明"}%
アナリスト格上げ/格下げ(90日): ${d.analystUpgrades90d ?? 0}件/${d.analystDowngrades90d ?? 0}件
決算連続予想超え: ${d.earningsBeatStreak ?? 0}期
ルールベースのファンダメンタル役スコア: ${d.fundamentalRoleScore ?? "不明"}/7点、センチメント役スコア: ${d.sentimentRoleScore ?? "不明"}/5点、マクロ役スコア: ${d.macroRoleScore ?? "不明"}/3点、委員会全体の合議賛成数: ${d.committeeAgree ?? "不明"}/${d.committeeTotal ?? "?"}

【出力形式】
必ず以下のJSON形式のみで出力してください(前後に説明文やマークダウンのコードフェンスは付けない):
{
  "verdict": "投資委員会としての結論(200字程度、日本語)。強気材料と弱気材料を両方具体的な数値付きで簡潔に触れたうえで、論点が何かを整理すること。"
}

重要: これは投資助言ではなく、あくまで議論のシミュレーションです。「買うべき」「売るべき」という断定的な推奨は書かず、「〜という点が強気材料」「〜が懸念材料」のようにデータに基づいた見立てとして書いてください。`;
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/stock/[ticker]/committee-discussion">) {
  const { ticker } = await ctx.params;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEYが設定されていません。.env.local.exampleを参考に.env.localを作成し、Anthropic Consoleで取得したAPIキーを設定してから開発サーバーを再起動してください。",
      },
      { status: 501 }
    );
  }

  let body: CommitteeRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: "user", content: buildPrompt({ ...body, ticker }) }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "委員会の結論を生成できませんでした" }, { status: 502 });
    }

    let parsed: { verdict: string };
    try {
      const cleaned = textBlock.text.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "委員会の結論の解析に失敗しました" }, { status: 502 });
    }

    return NextResponse.json({ verdict: parsed.verdict, model: MODEL });
  } catch (error) {
    console.error("Failed to generate committee discussion", error);
    return NextResponse.json({ error: "委員会の議論の生成に失敗しました" }, { status: 502 });
  }
}
