import type { ScreenMarket } from "./dailyScreenStore";

// 「運用者」シミュレーションの型定義・定数だけを切り出したファイル。
// personaStore.ts(fs等のNode専用APIを使うサーバー専用ロジック)と分けているのは、
// クライアントコンポーネント(PersonasTab)がPERSONA_DEFSを直接importすると、
// personaStore.ts経由でfsまでバンドルに含まれてビルドエラーになるため。
// ※ScreenMarketは型のみの参照なのでdailyScreenStore.ts本体はバンドルされない。

export type PersonaId = "trend" | "committee" | "value" | "growth" | "risk" | "income" | "event" | "manager";

// 「素の」運用者(manager以外)は、それぞれ実在の著名投資家の基準(PER/PBR/ROE/売上成長率などの
// 生データ)に沿った独自ルールで日々売買する。managerはその全員の意見(=その日それぞれが
// 「買いたい」と判定した候補)を聞いたうえで、過半数が支持した銘柄だけを厳選して採用する
// 「最終決定者」役。人間の判断を最終採否だけに絞りたい、という発想を模したポジション。
// リスク管理型・イベント警戒型は特定の投資家というより「守り」「タイミング回避」という
// ポートフォリオ運用上の別軸の発想のため、投資家名を冠していない。

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
    label: "グリーンブラット型(マジックフォーミュラ)",
    description: "ROE(質の高さ)とPERの低さ(割安さ)を組み合わせて選ぶ、質×割安の2軸重視型。",
    stopLossPct: -10,
    takeProfitPct: 20,
    maxNewEntriesPerDay: 2,
    maxHoldings: 8,
  },
  {
    id: "value",
    label: "グレアム型(資産バリュー投資)",
    description: "グレアム指数(PER×PBR)が5.0以下という厳しい基準で選ぶ、年率20%を狙う深い割安株投資。流動比率・負債比率で財務の固さも確認する。",
    stopLossPct: -12,
    takeProfitPct: 24,
    maxNewEntriesPerDay: 2,
    maxHoldings: 8,
  },
  {
    id: "growth",
    label: "リンチ型(GARP成長株)",
    description: "利益成長率が高いのに、その成長率に対してPERが割安(PEGレシオが低い)銘柄を狙う成長株投資。",
    stopLossPct: -10,
    takeProfitPct: 25,
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
    label: "シーゲル型(配当長期)",
    description: "配当利回りが高く、利益も減っていない(減配リスクが低い)財務健全な銘柄を選び、配当再投資による長期の複利を狙う。",
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
  description: "他の運用者のうち過半数が支持した銘柄だけを厳選して採用する、最終決定者役。1日1銘柄まで。",
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
