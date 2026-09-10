// SBI証券の実際の手数料体系(2026年時点、公式サイト・FAQで確認)。
// アプリ内の投資判断(運用アドバイザーの助言・検証用シミュレーション・投資シミュレーター)は
// すべてこの手数料を加味して計算する。
//
// 国内株: 「ゼロ革命」によりオンライン取引の売買手数料は¥0。
// 米国株: 約定代金の0.495%(税込)、上限22ドル(税込)、下限0ドル。買い・売り両方で発生。
// 為替手数料: SBI証券のリアルタイム為替取引は2026年4月時点で無料のため計算に含めない。
//
// 他社・他コースでは手数料体系が異なるため、あくまで「SBI証券を使う場合の目安」である点に注意。

const US_COMMISSION_RATE = 0.00495;
const US_COMMISSION_CAP_USD = 22;

// 約定代金(現地通貨)に対する手数料を、その通貨のまま返す。
export function brokerCommissionNative(tradeValueNative: number, currency: string | null | undefined): number {
  if (currency !== "USD") return 0; // 国内株(JPY)はゼロ革命で無料
  return Math.min(Math.max(tradeValueNative, 0) * US_COMMISSION_RATE, US_COMMISSION_CAP_USD);
}

// 円換算した手数料を返す(表示・サイジング計算用)。
export function brokerCommissionJpy(tradeValueNative: number, currency: string | null | undefined, usdJpy: number): number {
  const feeNative = brokerCommissionNative(tradeValueNative, currency);
  return currency === "USD" ? feeNative * usdJpy : feeNative;
}
