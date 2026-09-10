// 含み益が乗ったポジションの「利益を伸ばしつつ守る」ための簡易トレーリングストップ目安。
// オニール/ミネルヴィニ流によくある「50日移動平均線を明確に割ったら手仕舞いを検討する」
// という考え方を、StockMetricsに既にある価格と50日線乖離率(priceVs50ma)から追加取得なしで計算する。

export interface TrailingStopHint {
  ma50Price: number;
  belowMa50: boolean; // 現在値が50日線を割っているか
}

export function computeTrailingStopHint(price: number | null, priceVs50ma: number | null): TrailingStopHint | null {
  if (price == null || priceVs50ma == null) return null;
  const ma50Price = price / (1 + priceVs50ma / 100);
  if (!Number.isFinite(ma50Price) || ma50Price <= 0) return null;
  return {
    ma50Price: Math.round(ma50Price * 100) / 100,
    belowMa50: price < ma50Price,
  };
}
