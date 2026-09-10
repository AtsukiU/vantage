import type { ScreenMarket } from "./dailyScreenStore";

// 「運用者」シミュレーションの型定義・定数だけを切り出したファイル。
// personaStore.ts(fs等のNode専用APIを使うサーバー専用ロジック)と分けているのは、
// クライアントコンポーネント(PersonasTab)がPERSONA_DEFSを直接importすると、
// personaStore.ts経由でfsまでバンドルに含まれてビルドエラーになるため。
// ※ScreenMarketは型のみの参照なのでdailyScreenStore.ts本体はバンドルされない。

export type PersonaId = "trend" | "committee" | "value" | "risk" | "income" | "event" | "manager";

// 「素の」3運用者(trend/committee/value)は独自ルールで日々売買する。
// managerはその3人の意見(=その日それぞれが「買いたい」と判定した候補)を聞いたうえで、
// 複数人が支持した銘柄だけを厳選して採用する「最終決定者」役。人間の判断を最終採否だけに
// 絞りたい、という発想を模したポジション。

export interface PersonaDef {
  id: PersonaId;
  label: string;
  description: string;
  stopLossPct: number; // エントリー価格からの下落率
  takeProfitPct: number; // エントリー価格からの上昇率
  maxNewEntriesPerDay: number;
  maxHoldings: number;
  isManager?: boolean;
}

export const BASE_PERSONA_DEFS: PersonaDef[] = [
  {
    id: "trend",
    label: "トレンドフォロー(ミネルヴィニ型)",
    description: "ミネルヴィニ・トレンドテンプレートで高スコアの銘柄だけを機械的に買う、順張り型。",
    stopLossPct: -8,
    takeProfitPct: 16,
    maxNewEntriesPerDay: 2,
    maxHoldings: 8,
  },
  {
    id: "committee",
    label: "総合スコア型(投資委員会)",
    description: "総合評価(ミネルヴィニ/CANSLIM/財務健全性/委員会合議の平均)が高い銘柄をバランスよく買う。",
    stopLossPct: -10,
    takeProfitPct: 20,
    maxNewEntriesPerDay: 2,
    maxHoldings: 8,
  },
  {
    id: "value",
    label: "バリュー型(ファンダメンタル重視)",
    description: "ファンダメンタル役・財務健全性スコアが高い銘柄を選び、じっくり保有する長期志向。",
    stopLossPct: -12,
    takeProfitPct: 24,
    maxNewEntriesPerDay: 2,
    maxHoldings: 8,
  },
  {
    id: "risk",
    label: "リスク管理型(守り重視)",
    description: "財務健全性・マクロ環境・委員会合議の広い賛成が揃った銘柄だけを選ぶ、下落回避を優先する保守型。損切りも浅め。",
    stopLossPct: -5,
    takeProfitPct: 10,
    maxNewEntriesPerDay: 1,
    maxHoldings: 6,
  },
  {
    id: "income",
    label: "インカム型(配当重視)",
    description: "配当利回りが高く財務も健全な銘柄を選び、値上がり益より安定した配当収入を狙う長期保有志向。",
    stopLossPct: -12,
    takeProfitPct: 30,
    maxNewEntriesPerDay: 1,
    maxHoldings: 6,
  },
  {
    id: "event",
    label: "イベント警戒型",
    description: "総合スコアが高くても、決算発表が7日以内に迫っている銘柄は新規購入を避ける。決算またぎのボラティリティを避けたい人向け。",
    stopLossPct: -8,
    takeProfitPct: 16,
    maxNewEntriesPerDay: 2,
    maxHoldings: 8,
  },
];

export const MANAGER_DEF: PersonaDef = {
  id: "manager",
  label: "統括マネージャー",
  description: "他の6運用者のうち過半数が支持した銘柄だけを厳選して採用する、最終決定者役。1日1銘柄まで。",
  stopLossPct: -10,
  takeProfitPct: 20,
  maxNewEntriesPerDay: 1,
  maxHoldings: 6,
  isManager: true,
};

export const PERSONA_DEFS: PersonaDef[] = [...BASE_PERSONA_DEFS, MANAGER_DEF];

export const STARTING_CASH_JPY = 1_000_000;

export interface PersonaHolding {
  ticker: string;
  name: string | null;
  market: ScreenMarket;
  currency: string;
  shares: number;
  entryPrice: number; // 現地通貨
  entryDate: string;
  stopLoss: number; // 現地通貨
  takeProfit: number; // 現地通貨
  entryFeeJPY?: number; // 購入時に発生したSBI証券想定手数料(円換算、国内株は0)
}

export interface PersonaTrade {
  date: string;
  ticker: string;
  name: string | null;
  market: ScreenMarket;
  side: "buy" | "sell";
  price: number; // 現地通貨
  shares: number;
  reason: string;
  plJPY?: number; // sellの時のみ
}

export interface PersonaAccount {
  id: PersonaId;
  cashJPY: number;
  holdings: PersonaHolding[];
  trades: PersonaTrade[];
  equityHistory: { date: string; valueJPY: number }[];
}

export interface PersonasFile {
  lastRunDate: string | null; // 判断に使ったスキャンの日付(YYYY-MM-DD)
  lastRunAt: string | null; // 実際にボタンを押して判断した日時(ISO)
  usdJpy: number;
  accounts: Record<PersonaId, PersonaAccount>;
}
