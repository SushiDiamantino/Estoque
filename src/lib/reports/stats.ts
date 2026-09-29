import { addDays, diffDays, weekdayOf } from "./dates";

const Z80 = 1.2816; // intervalo de ~80%
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

export type ForecastResult = {
  method: "regressao" | "media" | "insuficiente";
  points: { date: string; value: number; low: number; high: number }[];
  total: number;
  low: number;
  high: number;
  slopePerDay: number;
  trendPctMonth: number | null;
  r2: number | null;
  factors: number[];
  ma7: (number | null)[];
};

/**
 * Projeção de consumo diário.
 * 1) Fatores sazonais por dia da semana (≥ 14 dias de histórico), normalizados para média 1.
 * 2) Regressão linear (mínimos quadrados) sobre a série dessazonalizada (≥ 7 dias); senão, média simples.
 * 3) Intervalo de ~80% com o desvio-padrão dos resíduos; no total, a incerteza cresce com √h.
 */
export function forecastDaily(
  history: { date: string; value: number }[],
  horizon: number,
  start: string
): ForecastResult {
  const n = history.length;
  const ys = history.map((h) => Math.max(0, h.value));
  const mean = n ? ys.reduce((a, b) => a + b, 0) / n : 0;
  const ma7 = ys.map((_, i) => (i < 6 ? null : ys.slice(i - 6, i + 1).reduce((a, b) => a + b, 0) / 7));

  const empty = (): ForecastResult => ({
    method: "insuficiente",
    points: Array.from({ length: horizon }, (_, k) => ({ date: addDays(start, k), value: 0, low: 0, high: 0 })),
    total: 0,
    low: 0,
    high: 0,
    slopePerDay: 0,
    trendPctMonth: null,
    r2: null,
    factors: Array(7).fill(1),
    ma7,
  });
  if (n === 0 || mean <= 0) return empty();

  let factors = Array(7).fill(1) as number[];
  if (n >= 14) {
    const sums = Array(7).fill(0) as number[];
    const cnt = Array(7).fill(0) as number[];
    history.forEach((h, i) => {
      const w = weekdayOf(h.date);
      sums[w] += ys[i];
      cnt[w]++;
    });
    factors = sums.map((s, w) => (cnt[w] ? clamp(s / cnt[w] / mean, 0.2, 3) : 1));
    const fm = factors.reduce((a, b) => a + b, 0) / 7;
    factors = factors.map((f) => f / fm);
  }

  const ds = history.map((h, i) => ys[i] / factors[weekdayOf(h.date)]);
  const dsMean = ds.reduce((a, b) => a + b, 0) / n;
  let a = dsMean;
  let b = 0;
  let sigma = 0;
  let r2: number | null = null;
  let method: ForecastResult["method"] = "media";

  if (n >= 7) {
    method = "regressao";
    const xbar = (n - 1) / 2;
    let sxy = 0;
    let sxx = 0;
    ds.forEach((y, x) => {
      sxy += (x - xbar) * (y - dsMean);
      sxx += (x - xbar) ** 2;
    });
    b = sxx > 0 ? sxy / sxx : 0;
    a = dsMean - b * xbar;
    let ssRes = 0;
    let ssTot = 0;
    ds.forEach((y, x) => {
      ssRes += (y - (a + b * x)) ** 2;
      ssTot += (y - dsMean) ** 2;
    });
    sigma = Math.sqrt(ssRes / Math.max(1, n - 2));
    r2 = ssTot > 0 ? clamp(1 - ssRes / ssTot, 0, 1) : null;
  } else {
    sigma = Math.sqrt(ds.reduce((s, y) => s + (y - dsMean) ** 2, 0) / Math.max(1, n - 1));
  }

  const lastDate = history[n - 1].date;
  const points = Array.from({ length: horizon }, (_, k) => {
    const date = addDays(start, k);
    const x = n - 1 + diffDays(lastDate, date);
    const base = Math.max(0, a + b * x);
    const f = factors[weekdayOf(date)];
    return {
      date,
      value: base * f,
      low: Math.max(0, (base - Z80 * sigma) * f),
      high: (base + Z80 * sigma) * f,
    };
  });
  const total = points.reduce((s, p) => s + p.value, 0);
  const spread = Z80 * sigma * Math.sqrt(horizon);

  return {
    method,
    points,
    total,
    low: Math.max(0, total - spread),
    high: total + spread,
    slopePerDay: b,
    trendPctMonth: dsMean > 0 && method === "regressao" ? ((b * 30) / dsMean) * 100 : null,
    r2,
    factors,
    ma7,
  };
}
