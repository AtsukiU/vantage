import type { ScoreResult } from "./checklistTypes";

// 「投資委員会」の合議スコア: ファンダメンタル役・テクニカル(ミネルヴィニ)役・センチメント役・
// リスク管理役(安全域)・マクロ役の5役のうち、何人が「賛成(良い)」と判定したかを表す。
// agree/totalの見出し数字はこの5役固定 — 本日の注目銘柄(サーバー側バッチスキャン)と
// 銘柄詳細ページ(クライアント側)で常に同じ分母になるようにするため。
// PM役(ポートフォリオマネージャー)はブラウザの保有銘柄データが必要なためサーバー側では
// 計算できず、詳細ページでのみ「参考情報」として追加表示される(roles.pmはnull以外になるが、
// agree/totalの集計には含めない)。以前はPM役を含めて6役の合議にしていたが、その結果
// 詳細ページとスキャン結果とで同じ銘柄でも数字が食い違って見える不整合があったため分離した。

export interface CommitteeVerdict {
  agree: number;
  total: number; // 常に5(fundamental/technical/sentiment/risk/macro)
  roles: {
    fundamental: boolean;
    technical: boolean;
    sentiment: boolean;
    risk: boolean;
    macro: boolean;
    pm: boolean | null; // 参考情報。詳細ページ以外(スクリーニング等)ではnull=判定対象外
  };
}

function isPositive(score: ScoreResult, threshold = 0.6): boolean {
  if (score.total === 0) return false;
  return score.passCount / score.total >= threshold;
}

export function computeCommitteeVerdict(
  fundamentalRole: ScoreResult,
  technicalRole: ScoreResult,
  sentimentRole: ScoreResult,
  marginOfSafetyRatio: number | null, // 現在値 ÷ グレアムナンバー。1.5倍以下なら安全域ありとみなす
  macroRole: ScoreResult,
  pmRole?: ScoreResult // 詳細ページのみ渡される(保有ポートフォリオが必要なため)。参考情報のみ
): CommitteeVerdict {
  const coreRoles = {
    fundamental: isPositive(fundamentalRole),
    technical: isPositive(technicalRole),
    sentiment: isPositive(sentimentRole),
    risk: marginOfSafetyRatio != null && marginOfSafetyRatio <= 1.5,
    macro: isPositive(macroRole),
  };
  const roles = { ...coreRoles, pm: pmRole ? isPositive(pmRole) : null };
  const agree = Object.values(coreRoles).filter((v) => v === true).length;
  return { agree, total: 5, roles };
}
