import type { DailyScreenEntry } from "./dailyScreenStore";
import { computeOverallScore } from "./dailyPickOverall";
import { BASE_PERSONA_DEFS } from "./personaDefs";

// 「運用者」の銘柄選定ロジックだけを切り出した、fsに依存しない純粋関数群。
// personaStore.ts(サーバー専用、仮想口座の永続化)と、実ポートフォリオへの助言を
// クライアント側で計算するportfolioAdvice.tsの両方から使う共通ロジック。

export type BasePersonaId = "trend" | "committee" | "value" | "risk" | "income" | "event";

// ISO日付文字列(YYYY-MM-DD)から、今日を起点とした日数を返す(未来ならプラス)。
function daysUntil(dateStr: string): number {
  const target = new Date(`${dateStr}T00:00:00Z`).getTime();
  return Math.floor((target - Date.now()) / (24 * 60 * 60 * 1000));
}

// 確信度連動サイジング: 総合評価(S/A/B/C/D)が高いほどリスク予算を厚くする。
export function convictionMultiplier(e: DailyScreenEntry): number {
  const { grade } = computeOverallScore(e);
  switch (grade) {
    case "S": return 1.5;
    case "A": return 1.2;
    case "B": return 1.0;
    case "C": return 0.8;
    default: return 0.6;
  }
}

// trend/committee/valueそれぞれの「この銘柄を買いたいか」の判定条件。
export function passesFilter(id: BasePersonaId, e: DailyScreenEntry): boolean {
  if (id === "trend") {
    // 本来のミネルヴィニ/CANSLIM流に、トレンドスコアに加えて相対力(RS)上位30%であることも要求する
    // (でないと「トレンドは強いがベンチマークに劣後している」銘柄まで拾ってしまうため)。
    return (
      e.minerviniScore != null &&
      e.minerviniTotal > 0 &&
      e.minerviniScore / e.minerviniTotal >= 0.85 &&
      e.rsPercentile != null &&
      e.rsPercentile >= 70
    );
  }
  if (id === "committee") {
    const { grade } = computeOverallScore(e);
    return grade === "S" || grade === "A";
  }
  if (id === "risk") {
    // 下落回避を優先する保守型: 財務健全性が非常に高く、マクロの逆風がなく、委員会の広い賛成が
    // 揃っていて、なおかつ相対力が極端に弱く(下落トレンド中)ないことを要求する。
    return (
      e.qualityScore != null &&
      e.qualityTotal > 0 &&
      e.qualityScore / e.qualityTotal >= 0.8 &&
      e.macroRoleScore != null &&
      e.macroRoleTotal > 0 &&
      e.macroRoleScore / e.macroRoleTotal >= 2 / 3 &&
      e.committeeAgree != null &&
      e.committeeTotal != null &&
      e.committeeTotal > 0 &&
      e.committeeAgree / e.committeeTotal >= 0.6 &&
      (e.rsPercentile == null || e.rsPercentile >= 40)
    );
  }
  if (id === "value") {
    return (
      e.fundamentalRoleScore != null &&
      e.fundamentalRoleTotal > 0 &&
      e.fundamentalRoleScore / e.fundamentalRoleTotal >= 0.7 &&
      e.qualityScore != null &&
      e.qualityTotal > 0 &&
      e.qualityScore / e.qualityTotal >= 0.7
    );
  }
  if (id === "income") {
    // 値上がり益より配当の安定収入を狙う: 配当利回りが一定以上、かつ財務がある程度健全
    // (高利回りだが財務が傷んでいる「配当トラップ」銘柄を避けるため)。
    return (
      e.dividendYield != null &&
      e.dividendYield >= 2.5 &&
      e.qualityScore != null &&
      e.qualityTotal > 0 &&
      e.qualityScore / e.qualityTotal >= 0.6
    );
  }
  // event: 総合スコアが高い銘柄の中から、決算発表が7日以内に迫っているものだけを除外する
  const { grade } = computeOverallScore(e);
  if (grade !== "S" && grade !== "A") return false;
  if (e.earningsDate == null) return true;
  const days = daysUntil(e.earningsDate);
  return days < 0 || days > 7;
}

// 各パーソナのエントリー候補選定ルール。プールから「まだ保有していない」銘柄を対象に、
// 条件を満たすものをランキング順に返す。
export function candidatesFor(id: BasePersonaId, pool: DailyScreenEntry[], held: Set<string>): DailyScreenEntry[] {
  const notHeld = pool.filter((e) => !held.has(e.ticker) && e.price != null && e.price > 0 && e.currency && passesFilter(id, e));

  if (id === "trend") {
    return notHeld.sort((a, b) => b.minerviniScore! / b.minerviniTotal - a.minerviniScore! / a.minerviniTotal);
  }
  if (id === "committee") {
    return notHeld.sort((a, b) => computeOverallScore(b).score - computeOverallScore(a).score);
  }
  if (id === "risk") {
    return notHeld.sort((a, b) => {
      const ra = a.qualityScore! / a.qualityTotal + a.macroRoleScore! / a.macroRoleTotal + a.committeeAgree! / a.committeeTotal!;
      const rb = b.qualityScore! / b.qualityTotal + b.macroRoleScore! / b.macroRoleTotal + b.committeeAgree! / b.committeeTotal!;
      return rb - ra;
    });
  }
  if (id === "value") {
    return notHeld.sort((a, b) => {
      const ra = a.fundamentalRoleScore! / a.fundamentalRoleTotal + a.qualityScore! / a.qualityTotal;
      const rb = b.fundamentalRoleScore! / b.fundamentalRoleTotal + b.qualityScore! / b.qualityTotal;
      return rb - ra;
    });
  }
  if (id === "income") {
    return notHeld.sort((a, b) => b.dividendYield! - a.dividendYield!);
  }
  // event: 総合評価順(選定条件自体がcommitteeと同じ土台のため)
  return notHeld.sort((a, b) => computeOverallScore(b).score - computeOverallScore(a).score);
}

export const BASE_LABEL_SHORT: Record<BasePersonaId, string> = {
  trend: "トレンド",
  committee: "総合スコア",
  value: "バリュー",
  risk: "リスク管理",
  income: "インカム",
  event: "イベント警戒",
};

// 統括マネージャーが「合議採用」とみなすために必要な最低支持者数(過半数)。
export function managerMajorityThreshold(): number {
  return Math.floor(BASE_PERSONA_DEFS.length / 2) + 1;
}

// 各運用者が「自分の一押し」とみなす上位件数。managerCandidatesの支持判定はこの中からだけ選ぶ
// (単に合格ラインを超えているだけでなく、その人自身のランキングでも上位に入っている必要がある)。
const MANAGER_TOP_N = 15;

// managerの候補選定: 他の運用者のうち過半数(ceil((N+1)/2))が、それぞれの上位MANAGER_TOP_N件の
// 中でこの銘柄を推している場合だけを、支持者数の多い順(同数なら総合評価順)に返す。
// 3人中2人以上、4人中3人以上、のように素の運用者の人数が変わっても「過半数」の意味を保つ。
export function managerCandidates(
  pool: DailyScreenEntry[],
  held: Set<string>
): { entry: DailyScreenEntry; supporters: BasePersonaId[] }[] {
  const majorityThreshold = managerMajorityThreshold();
  const topTickersByPersona = new Map<BasePersonaId, Set<string>>(
    BASE_PERSONA_DEFS.map((d) => {
      const id = d.id as BasePersonaId;
      return [id, new Set(candidatesFor(id, pool, held).slice(0, MANAGER_TOP_N).map((e) => e.ticker))];
    })
  );
  const notHeld = pool.filter((e) => !held.has(e.ticker) && e.price != null && e.price > 0 && e.currency);
  const withSupport = notHeld.map((e) => ({
    entry: e,
    supporters: BASE_PERSONA_DEFS.map((d) => d.id as BasePersonaId).filter((id) => topTickersByPersona.get(id)!.has(e.ticker)),
  }));
  return withSupport
    .filter(({ supporters }) => supporters.length >= majorityThreshold)
    .sort((a, b) => {
      if (b.supporters.length !== a.supporters.length) return b.supporters.length - a.supporters.length;
      return computeOverallScore(b.entry).score - computeOverallScore(a.entry).score;
    });
}

// 銘柄について、trend/committee/valueのうち何人が現在も支持しているかを返す
// (manager役の「保有継続 or 手放すべきか」判定や、実ポートフォリオへの助言に使う)。
export function supportersFor(e: DailyScreenEntry): BasePersonaId[] {
  return BASE_PERSONA_DEFS.map((d) => d.id as BasePersonaId).filter((id) => passesFilter(id, e));
}

export interface FilterExplanation {
  label: string;
  value: string;
  pass: boolean;
}

// passesFilterが「なぜ賛成/反対なのか」を人間向けに分解したもの。運用アドバイザーの
// 買い推奨・売り推奨にホバーした時の内訳表示に使う(判定条件そのものは変えない)。
export function explainFilter(id: BasePersonaId, e: DailyScreenEntry): FilterExplanation[] {
  const ratioLabel = (score: number | null, total: number) => (score != null && total > 0 ? `${score}/${total}` : "データなし");

  if (id === "trend") {
    const mRatio = e.minerviniScore != null && e.minerviniTotal > 0 ? e.minerviniScore / e.minerviniTotal : null;
    return [
      { label: "ミネルヴィニ・トレンドテンプレート", value: ratioLabel(e.minerviniScore, e.minerviniTotal), pass: mRatio != null && mRatio >= 0.85 },
      { label: "相対力(RS)パーセンタイル", value: e.rsPercentile != null ? `${e.rsPercentile}(基準70以上)` : "データなし", pass: e.rsPercentile != null && e.rsPercentile >= 70 },
    ];
  }
  if (id === "committee") {
    const { grade, score } = computeOverallScore(e);
    return [{ label: "総合評価グレード", value: `${grade}(${score}点、基準A以上)`, pass: grade === "S" || grade === "A" }];
  }
  if (id === "risk") {
    const qRatio = e.qualityScore != null && e.qualityTotal > 0 ? e.qualityScore / e.qualityTotal : null;
    const mRatio = e.macroRoleScore != null && e.macroRoleTotal > 0 ? e.macroRoleScore / e.macroRoleTotal : null;
    const cRatio = e.committeeAgree != null && e.committeeTotal ? e.committeeAgree / e.committeeTotal : null;
    return [
      { label: "財務健全性", value: `${ratioLabel(e.qualityScore, e.qualityTotal)}(基準80%以上)`, pass: qRatio != null && qRatio >= 0.8 },
      { label: "マクロ役", value: `${ratioLabel(e.macroRoleScore, e.macroRoleTotal)}(基準67%以上)`, pass: mRatio != null && mRatio >= 2 / 3 },
      { label: "投資委員会", value: `${e.committeeAgree ?? "—"}/${e.committeeTotal ?? "—"}(基準60%以上)`, pass: cRatio != null && cRatio >= 0.6 },
      { label: "相対力(RS)", value: e.rsPercentile != null ? `${e.rsPercentile}(基準40以上)` : "データなし(条件対象外)", pass: e.rsPercentile == null || e.rsPercentile >= 40 },
    ];
  }
  if (id === "value") {
    const fRatio = e.fundamentalRoleScore != null && e.fundamentalRoleTotal > 0 ? e.fundamentalRoleScore / e.fundamentalRoleTotal : null;
    const qRatio = e.qualityScore != null && e.qualityTotal > 0 ? e.qualityScore / e.qualityTotal : null;
    return [
      { label: "ファンダメンタル役", value: `${ratioLabel(e.fundamentalRoleScore, e.fundamentalRoleTotal)}(基準70%以上)`, pass: fRatio != null && fRatio >= 0.7 },
      { label: "財務健全性", value: `${ratioLabel(e.qualityScore, e.qualityTotal)}(基準70%以上)`, pass: qRatio != null && qRatio >= 0.7 },
    ];
  }
  if (id === "income") {
    const qRatio = e.qualityScore != null && e.qualityTotal > 0 ? e.qualityScore / e.qualityTotal : null;
    return [
      { label: "配当利回り", value: e.dividendYield != null ? `${e.dividendYield.toFixed(2)}%(基準2.5%以上)` : "データなし", pass: e.dividendYield != null && e.dividendYield >= 2.5 },
      { label: "財務健全性", value: `${ratioLabel(e.qualityScore, e.qualityTotal)}(基準60%以上)`, pass: qRatio != null && qRatio >= 0.6 },
    ];
  }
  // event
  const { grade, score } = computeOverallScore(e);
  const goodScore = grade === "S" || grade === "A";
  let earningsOk = true;
  let earningsLabel = "決算日不明(対象外)";
  if (e.earningsDate != null) {
    const days = daysUntil(e.earningsDate);
    earningsOk = days < 0 || days > 7;
    earningsLabel = `決算まで${days}日(基準: 7日超)`;
  }
  return [
    { label: "総合評価グレード", value: `${grade}(${score}点、基準A以上)`, pass: goodScore },
    { label: "決算発表までの日数", value: earningsLabel, pass: earningsOk },
  ];
}

// managerの合議内訳(各運用者が支持しているかどうか)。
export function explainManager(e: DailyScreenEntry): FilterExplanation[] {
  return BASE_PERSONA_DEFS.map((d) => {
    const id = d.id as BasePersonaId;
    const pass = passesFilter(id, e);
    return { label: BASE_LABEL_SHORT[id], value: pass ? "支持" : "不支持", pass };
  });
}
