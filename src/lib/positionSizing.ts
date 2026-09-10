// ミネルヴィニやオニールが重視する「損切りありきのポジションサイジング」の計算。
// 口座評価額に対して許容できるリスク%と、エントリー価格・損切りラインから
// 最大株数と実際のリスク額を逆算する(有名な「1トレードあたり口座の1〜2%まで」ルール)。
// あわせて、損切り幅に対してリスクリワード比(目安2倍など)から利確ラインも逆算する
// (「損切りは小さく、利益は伸ばす」という同じ思想の対になる計算)。

export interface PositionSizeInput {
  accountValue: number;
  riskPercent: number; // 口座に対して許容するリスク(%)
  entryPrice: number;
  stopPrice: number;
  rewardMultiple: number; // リスクリワード比(損切り幅の何倍を利確目標にするか)
}

export interface PositionSizeResult {
  riskPerShare: number;
  maxShares: number;
  positionValue: number;
  positionPercentOfAccount: number;
  totalRiskAmount: number;
  stopLossPercent: number; // エントリーからのストップ幅(%)
  targetPrice: number;
  takeProfitPercent: number; // エントリーからの利確幅(%)
  potentialGainTotal: number; // 利確ラインに達した場合の想定利益額
}

export function calcPositionSize(input: PositionSizeInput): PositionSizeResult | null {
  const { accountValue, riskPercent, entryPrice, stopPrice, rewardMultiple } = input;
  if (accountValue <= 0 || riskPercent <= 0 || entryPrice <= 0 || stopPrice <= 0 || rewardMultiple <= 0) return null;
  if (stopPrice >= entryPrice) return null; // 買いポジション前提(損切りはエントリーより下)

  const riskPerShare = entryPrice - stopPrice;
  const totalRiskBudget = accountValue * (riskPercent / 100);
  const maxShares = Math.floor(totalRiskBudget / riskPerShare);
  const positionValue = maxShares * entryPrice;
  const totalRiskAmount = maxShares * riskPerShare;
  const targetPrice = entryPrice + riskPerShare * rewardMultiple;
  const potentialGainTotal = maxShares * riskPerShare * rewardMultiple;

  return {
    riskPerShare: Math.round(riskPerShare * 100) / 100,
    maxShares,
    positionValue: Math.round(positionValue),
    positionPercentOfAccount: Math.round((positionValue / accountValue) * 1000) / 10,
    totalRiskAmount: Math.round(totalRiskAmount),
    stopLossPercent: Math.round(((entryPrice - stopPrice) / entryPrice) * 1000) / 10,
    targetPrice: Math.round(targetPrice * 100) / 100,
    takeProfitPercent: Math.round(((targetPrice - entryPrice) / entryPrice) * 1000) / 10,
    potentialGainTotal: Math.round(potentialGainTotal),
  };
}
