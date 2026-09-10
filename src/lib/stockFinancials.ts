import { fetchYahooAuthenticated, num, type RawNum } from "./stockMetrics";

// 「営業利益が右肩上がりか」のような複数年の業績トレンドを見るためのデータ取得。
// quoteSummaryのincomeStatementHistoryは現在エンドデートのみしか返さないため、
// stockMetrics.tsの自己資本比率と同じく ws/fundamentals-timeseries から直接取る。

export interface FinancialYear {
  fiscalYearEnd: string; // 決算期末(ISO date、例: "2026-03-31")
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
}

interface TimeseriesEntry {
  asOfDate?: string;
  reportedValue?: RawNum;
}
interface TimeseriesResult {
  meta?: { type?: string[] };
  annualTotalRevenue?: (TimeseriesEntry | null)[];
  annualOperatingIncome?: (TimeseriesEntry | null)[];
  annualNetIncome?: (TimeseriesEntry | null)[];
}

function seriesByDate(entries: (TimeseriesEntry | null)[] | undefined): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries ?? []) {
    if (!e?.asOfDate) continue;
    const v = num(e.reportedValue);
    if (v != null) map.set(e.asOfDate, v);
  }
  return map;
}

// 直近5年分の売上高・営業利益・純利益の年次推移を取得する。
export async function fetchFinancialTrend(ticker: string): Promise<FinancialYear[]> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 6 * 365 * 24 * 3600;

  const res = await fetchYahooAuthenticated(
    (crumb) =>
      `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(
        ticker
      )}?symbol=${encodeURIComponent(
        ticker
      )}&type=annualTotalRevenue,annualOperatingIncome,annualNetIncome&period1=${period1}&period2=${period2}&crumb=${encodeURIComponent(
        crumb
      )}`
  );
  if (!res.ok) return [];

  const json = await res.json();
  const results = (json?.timeseries?.result ?? []) as TimeseriesResult[];

  const revenue = seriesByDate(results.find((r) => r.meta?.type?.[0] === "annualTotalRevenue")?.annualTotalRevenue);
  const operatingIncome = seriesByDate(
    results.find((r) => r.meta?.type?.[0] === "annualOperatingIncome")?.annualOperatingIncome
  );
  const netIncome = seriesByDate(
    results.find((r) => r.meta?.type?.[0] === "annualNetIncome")?.annualNetIncome
  );

  const dates = Array.from(new Set([...revenue.keys(), ...operatingIncome.keys(), ...netIncome.keys()])).sort();

  return dates.map((d) => ({
    fiscalYearEnd: d,
    revenue: revenue.get(d) ?? null,
    operatingIncome: operatingIncome.get(d) ?? null,
    netIncome: netIncome.get(d) ?? null,
  }));
}
