export const money = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const moneyShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 10_000) return `R$ ${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  if (a >= 1_000) return `R$ ${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mil`;
  return `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};

export const pctFmt = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`;

export const signedPct = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n > 0 ? "+" : ""}${pctFmt(n)}`;

export const qty = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
export const int = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
export const dec = (n: number | null | undefined, d = 1) =>
  n === null || n === undefined ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d });

export const daysFmt = (n: number | null | undefined) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 365) return "> 1 ano";
  if (n < 1) return "< 1 dia";
  return `${Math.floor(n)} dia${Math.floor(n) === 1 ? "" : "s"}`;
};

export const pctChange = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? 0 : null) : (cur - prev) / prev);

export const BUCKET_NAME = { day: "dia", week: "semana", month: "mês" } as const;
