import type { DailyScreenEntry } from "./dailyScreenStore";
import { computeOverallScore } from "./dailyPickOverall";
import { BASE_PERSONA_DEFS, type PersonaStyle } from "./personaDefs";

// 「運用者」の銘柄選定ロジックだけを切り出した、fsに依存しない純粋関数群。
// personaStore.ts(サーバー専用、仮想口座の永続化)と、実ポートフォリオへの助言を
// クライアント側で計算するportfolioAdvice.tsの両方から使う共通ロジック。

export type BasePersonaId =
  | "trend"
  | "oneil"
  | "committee"
  | "value"
  | "kabu1000"
  | "buffett"
  | "growth"
  | "risk"
  | "income"
  | "event";

// ユーザーが設定で「バリュー重視/グロース重視」を選んだ時、統括マネージャーの合議に参加する
// 運用者のIDを返す。対立するスタイル(バリューを選べばグロース)だけを除外し、中立は常に参加する。
// 指定なし(undefined/"neutral"相当の選択が無い状態)なら全員参加。
export function activePersonaIds(preference: PersonaStyle | null | undefined): BasePersonaId[] {
  const opposite: PersonaStyle | null = preference === "value" ? "growth" : preference === "growth" ? "value" : null;
  return BASE_PERSONA_DEFS.filter((d) => d.style !== opposite).map((d) => d.id as BasePersonaId);
}

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

// 各運用者の「この銘柄を買いたいか」の判定条件。committee/value/growthは実在の投資家が
// 使っていた基準(PER/PBR/ROE/売上・利益成長率など)を、取得できる生データの範囲で再現している。
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
  if (id === "oneil") {
    // オニール「CANSLIM」: 利益成長などを問うCANSLIMスコアが高く、かつ相対力(RS)が市場上位20%
    // (IBDのRSレーティング80以上に相当)に入っている「値動きのリーダー」だけを狙う。
    return (
      e.canslimScore != null &&
      e.canslimTotal > 0 &&
      e.canslimScore / e.canslimTotal >= 0.7 &&
      e.rsPercentile != null &&
      e.rsPercentile >= 80
    );
  }
  if (id === "committee") {
    // グリーンブラット「マジックフォーミュラ」: 質の高さ(ROE)と割安さ(低PER)を両方要求する。
    return e.roe != null && e.roe >= 15 && e.per != null && e.per > 0 && e.per <= 20;
  }
  if (id === "buffett") {
    // バフェット「クオリティ・バリュー」: 高ROE(質)・低負債(財務の保守性)・妥当な株価
    // (高すぎない)をすべて満たす銘柄を狙う。グリーンブラット型と似ているが、割安さより
    // 質と財務の保守性(負債の少なさ)を明示的に要求する点が異なる。
    return (
      e.roe != null &&
      e.roe >= 15 &&
      e.per != null &&
      e.per > 0 &&
      e.per <= 25 &&
      (e.debtToEquity == null || e.debtToEquity <= 50)
    );
  }
  if (id === "value") {
    // グレアム「ディープバリュー(資産バリュー投資)」: 「グレアム指数」(PER×PBR、グレアム自身の
    // 複合指標)が22.5以下という、グレアム自身の著書での目安どおりの基準で選ぶ。
    // (より厳選した5.0基準は、かぶ1000型が引き継いでいる)。
    // それに加えて流動比率・負債比率(財務の固さ=資産価値の裏付け)で安全域を確認する。
    // current/debtはデータが取れない銘柄(特にJP中小型株)が多いため、無ければ条件対象外として
    // 通す(必須にすると候補がほぼゼロになってしまうため)。
    return (
      e.per != null &&
      e.per > 0 &&
      e.pbr != null &&
      e.pbr > 0 &&
      e.per * e.pbr <= 22.5 &&
      (e.currentRatio == null || e.currentRatio >= 1.5) &&
      (e.debtToEquity == null || e.debtToEquity <= 150)
    );
  }
  if (id === "kabu1000") {
    // かぶ1000「小型資産バリュー」: グレアム型と同じ財務健全基準に、グレアム指数5.0以下という
    // より厳しい割安基準(年率20%を狙う水準)と、時価総額の小ささ(機関投資家が入ってこない領域)を
    // 組み合わせる。JPY建ては300億円以下、USD建ては5億ドル以下を目安にする
    // (市場ごとに規模の桁が違うため通貨別にしきい値を分ける)。
    const capThreshold = e.currency === "USD" ? 500_000_000 : 30_000_000_000;
    return (
      e.per != null &&
      e.per > 0 &&
      e.pbr != null &&
      e.pbr > 0 &&
      e.per * e.pbr <= 5.0 &&
      (e.currentRatio == null || e.currentRatio >= 1.5) &&
      (e.debtToEquity == null || e.debtToEquity <= 150) &&
      e.marketCap != null &&
      e.marketCap > 0 &&
      e.marketCap <= capThreshold
    );
  }
  if (id === "growth") {
    // リンチ「PEGレシオ」: 利益成長率が高く、かつその成長率の割にPERが割安(PEG≦1.5)な銘柄。
    return (
      e.earningsGrowth != null &&
      e.earningsGrowth >= 15 &&
      e.per != null &&
      e.per > 0 &&
      e.per / e.earningsGrowth <= 1.5
    );
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
  if (id === "income") {
    // シーゲル「配当長期」: 値上がり益より配当の安定収入を狙う。配当利回りが一定以上、かつ
    // 利益が減っていない(=減配リスクが低い、高利回りだが業績が傷んでいる「配当トラップ」を避ける)。
    return (
      e.dividendYield != null &&
      e.dividendYield >= 2.5 &&
      e.qualityScore != null &&
      e.qualityTotal > 0 &&
      e.qualityScore / e.qualityTotal >= 0.6 &&
      (e.earningsGrowth == null || e.earningsGrowth >= -5)
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
  if (id === "oneil") {
    // 相対力(RS)が高いほど「値動きのリーダー」として魅力が高いとみなす。
    return notHeld.sort((a, b) => b.rsPercentile! - a.rsPercentile!);
  }
  if (id === "committee") {
    // ROE÷PER(質÷価格)が高いほど「質の割に安い」= マジックフォーミュラ的に魅力が高いとみなす。
    return notHeld.sort((a, b) => b.roe! / b.per! - a.roe! / a.per!);
  }
  if (id === "buffett") {
    // ROEが高いほど「質」が高いとみなす(割安さより質を優先する、バフェットの発想通り)。
    return notHeld.sort((a, b) => b.roe! - a.roe!);
  }
  if (id === "risk") {
    return notHeld.sort((a, b) => {
      const ra = a.qualityScore! / a.qualityTotal + a.macroRoleScore! / a.macroRoleTotal + a.committeeAgree! / a.committeeTotal!;
      const rb = b.qualityScore! / b.qualityTotal + b.macroRoleScore! / b.macroRoleTotal + b.committeeAgree! / b.committeeTotal!;
      return rb - ra;
    });
  }
  if (id === "value") {
    // PER×PBR(グレアム自身の合成指標)が低いほど割安とみなす。
    return notHeld.sort((a, b) => a.per! * a.pbr! - b.per! * b.pbr!);
  }
  if (id === "kabu1000") {
    // 時価総額が小さいほど「機関投資家が入ってこない、より狙い目な」銘柄とみなす。
    return notHeld.sort((a, b) => a.marketCap! - b.marketCap!);
  }
  if (id === "growth") {
    // PEGレシオ(PER÷利益成長率)が低いほど「成長の割に割安」とみなす。
    return notHeld.sort((a, b) => a.per! / a.earningsGrowth! - b.per! / b.earningsGrowth!);
  }
  if (id === "income") {
    return notHeld.sort((a, b) => b.dividendYield! - a.dividendYield!);
  }
  // event: 総合評価順(選定条件自体がcommitteeと同じ土台のため)
  return notHeld.sort((a, b) => computeOverallScore(b).score - computeOverallScore(a).score);
}

export const BASE_LABEL_SHORT: Record<BasePersonaId, string> = {
  trend: "トレンド",
  oneil: "オニール",
  committee: "グリーンブラット",
  value: "グレアム",
  kabu1000: "かぶ1000",
  buffett: "バフェット",
  growth: "リンチ",
  risk: "リスク管理",
  income: "シーゲル",
  event: "イベント警戒",
};

// 統括マネージャーが「合議採用」とみなすために必要な最低支持者数(過半数)。
// activeCount未指定時は全運用者数を基準にする。スタイル設定で一部の運用者が合議から
// 除外されている場合は、呼び出し元がactivePersonaIds().lengthを渡す。
export function managerMajorityThreshold(activeCount: number = BASE_PERSONA_DEFS.length): number {
  return Math.floor(activeCount / 2) + 1;
}

// managerの候補選定: 合議に参加する運用者(activeIds、既定は全員)のうち過半数が、それぞれの
// 条件(passesFilter)を満たしている銘柄だけを、支持者数の多い順(同数なら総合評価順)に返す。
// 以前は「その運用者自身のランキングで上位15位以内」という追加条件もあったが、各運用者が
// 全く異なる指標(モメンタム順・PER×PBR順・ROE順など)でランキングするため、条件は満たして
// いても複数の運用者で同時に上位15位に入る銘柄が実質ゼロになってしまっていた。単に条件を
// 満たしているかどうかだけで支持とみなす方が、本来の「多数決」の趣旨に合う。
// 人数が変わっても(=スタイル設定で一部除外されていても)「過半数」の意味を保つ。
export function managerCandidates(
  pool: DailyScreenEntry[],
  held: Set<string>,
  activeIds: BasePersonaId[] = BASE_PERSONA_DEFS.map((d) => d.id as BasePersonaId)
): { entry: DailyScreenEntry; supporters: BasePersonaId[] }[] {
  const majorityThreshold = managerMajorityThreshold(activeIds.length);
  const notHeld = pool.filter((e) => !held.has(e.ticker) && e.price != null && e.price > 0 && e.currency);
  const withSupport = notHeld.map((e) => ({
    entry: e,
    supporters: supportersFor(e, activeIds),
  }));
  return withSupport
    .filter(({ supporters }) => supporters.length >= majorityThreshold)
    .sort((a, b) => {
      if (b.supporters.length !== a.supporters.length) return b.supporters.length - a.supporters.length;
      return computeOverallScore(b.entry).score - computeOverallScore(a.entry).score;
    });
}

// 銘柄について、合議に参加する運用者(activeIds、既定は全員)のうち何人が現在も支持しているかを
// 返す(manager役の「保有継続 or 手放すべきか」判定や、実ポートフォリオへの助言に使う)。
export function supportersFor(
  e: DailyScreenEntry,
  activeIds: BasePersonaId[] = BASE_PERSONA_DEFS.map((d) => d.id as BasePersonaId)
): BasePersonaId[] {
  return activeIds.filter((id) => passesFilter(id, e));
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
  if (id === "oneil") {
    const cRatio = e.canslimScore != null && e.canslimTotal > 0 ? e.canslimScore / e.canslimTotal : null;
    return [
      { label: "CANSLIMスコア", value: ratioLabel(e.canslimScore, e.canslimTotal), pass: cRatio != null && cRatio >= 0.7 },
      { label: "相対力(RS)パーセンタイル", value: e.rsPercentile != null ? `${e.rsPercentile}(基準80以上)` : "データなし", pass: e.rsPercentile != null && e.rsPercentile >= 80 },
    ];
  }
  if (id === "committee") {
    return [
      { label: "ROE(質)", value: e.roe != null ? `${e.roe.toFixed(1)}%(基準15%以上)` : "データなし", pass: e.roe != null && e.roe >= 15 },
      { label: "PER(割安さ)", value: e.per != null ? `${e.per.toFixed(1)}倍(基準20倍以下)` : "データなし", pass: e.per != null && e.per > 0 && e.per <= 20 },
    ];
  }
  if (id === "buffett") {
    return [
      { label: "ROE(質)", value: e.roe != null ? `${e.roe.toFixed(1)}%(基準15%以上)` : "データなし", pass: e.roe != null && e.roe >= 15 },
      { label: "PER", value: e.per != null ? `${e.per.toFixed(1)}倍(基準25倍以下)` : "データなし", pass: e.per != null && e.per > 0 && e.per <= 25 },
      { label: "負債比率(D/E)", value: e.debtToEquity != null ? `${e.debtToEquity.toFixed(0)}%(基準50%以下)` : "データなし(条件対象外)", pass: e.debtToEquity == null || e.debtToEquity <= 50 },
    ];
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
    const grahamIndex = e.per != null && e.pbr != null && e.per > 0 && e.pbr > 0 ? e.per * e.pbr : null;
    return [
      { label: "グレアム指数(PER×PBR)", value: grahamIndex != null ? `${grahamIndex.toFixed(1)}(基準22.5以下)` : "データなし", pass: grahamIndex != null && grahamIndex <= 22.5 },
      { label: "PER", value: e.per != null ? `${e.per.toFixed(1)}倍` : "データなし", pass: e.per != null && e.per > 0 },
      { label: "PBR", value: e.pbr != null ? `${e.pbr.toFixed(2)}倍` : "データなし", pass: e.pbr != null && e.pbr > 0 },
      { label: "流動比率", value: e.currentRatio != null ? `${e.currentRatio.toFixed(2)}(基準1.5以上)` : "データなし(条件対象外)", pass: e.currentRatio == null || e.currentRatio >= 1.5 },
      { label: "負債比率(D/E)", value: e.debtToEquity != null ? `${e.debtToEquity.toFixed(0)}%(基準150%以下)` : "データなし(条件対象外)", pass: e.debtToEquity == null || e.debtToEquity <= 150 },
    ];
  }
  if (id === "kabu1000") {
    const grahamIndex = e.per != null && e.pbr != null && e.per > 0 && e.pbr > 0 ? e.per * e.pbr : null;
    const capThreshold = e.currency === "USD" ? 500_000_000 : 30_000_000_000;
    const capLabel = e.currency === "USD" ? "5億ドル以下" : "300億円以下";
    return [
      { label: "グレアム指数(PER×PBR)", value: grahamIndex != null ? `${grahamIndex.toFixed(1)}(基準5.0以下)` : "データなし", pass: grahamIndex != null && grahamIndex <= 5.0 },
      { label: "時価総額", value: e.marketCap != null ? `${(e.marketCap / (e.currency === "USD" ? 1e6 : 1e8)).toFixed(0)}${e.currency === "USD" ? "M" : "億円"}(基準${capLabel})` : "データなし", pass: e.marketCap != null && e.marketCap > 0 && e.marketCap <= capThreshold },
      { label: "流動比率", value: e.currentRatio != null ? `${e.currentRatio.toFixed(2)}(基準1.5以上)` : "データなし(条件対象外)", pass: e.currentRatio == null || e.currentRatio >= 1.5 },
      { label: "負債比率(D/E)", value: e.debtToEquity != null ? `${e.debtToEquity.toFixed(0)}%(基準150%以下)` : "データなし(条件対象外)", pass: e.debtToEquity == null || e.debtToEquity <= 150 },
    ];
  }
  if (id === "growth") {
    const peg = e.per != null && e.earningsGrowth != null && e.earningsGrowth !== 0 ? e.per / e.earningsGrowth : null;
    return [
      { label: "利益成長率", value: e.earningsGrowth != null ? `${e.earningsGrowth.toFixed(1)}%(基準15%以上)` : "データなし", pass: e.earningsGrowth != null && e.earningsGrowth >= 15 },
      { label: "PEGレシオ", value: peg != null ? `${peg.toFixed(2)}(基準1.5以下)` : "データなし", pass: peg != null && peg <= 1.5 },
    ];
  }
  if (id === "income") {
    const qRatio = e.qualityScore != null && e.qualityTotal > 0 ? e.qualityScore / e.qualityTotal : null;
    return [
      { label: "配当利回り", value: e.dividendYield != null ? `${e.dividendYield.toFixed(2)}%(基準2.5%以上)` : "データなし", pass: e.dividendYield != null && e.dividendYield >= 2.5 },
      { label: "財務健全性", value: `${ratioLabel(e.qualityScore, e.qualityTotal)}(基準60%以上)`, pass: qRatio != null && qRatio >= 0.6 },
      { label: "利益成長率(減配リスク)", value: e.earningsGrowth != null ? `${e.earningsGrowth.toFixed(1)}%(基準-5%以上)` : "データなし(条件対象外)", pass: e.earningsGrowth == null || e.earningsGrowth >= -5 },
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
