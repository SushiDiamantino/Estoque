/** Utilitários de data em "YYYY-MM-DD" (aritmética em UTC — sem surpresas de fuso). */
import type { Bucket } from "./types";

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_DAY = 86_400_000;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const toUTC = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUTC = (t: number) => new Date(t).toISOString().slice(0, 10);

export const addDays = (s: string, n: number) => fromUTC(toUTC(s) + n * MS_DAY);
/** b − a em dias */
export const diffDays = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / MS_DAY);
export const weekdayOf = (s: string) => new Date(toUTC(s)).getUTCDay();
export const minDay = (a: string, b: string) => (a < b ? a : b);

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function todayLocal(tz = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export const fmtDay = (s: string | null | undefined) => (s && DAY_RE.test(s) ? s.split("-").reverse().join("/") : "—");
export const fmtDayShort = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;

export function bucketKey(d: string, b: Bucket): string {
  if (b === "day") return d;
  if (b === "week") return addDays(d, -((weekdayOf(d) + 6) % 7)); // segunda-feira
  return d.slice(0, 7);
}

export function bucketLabel(key: string, b: Bucket): string {
  if (b === "day") return fmtDayShort(key);
  if (b === "week") return `sem ${fmtDayShort(key)}`;
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1]}/${y.slice(2)}`;
}

export const PRESETS = [
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "90d", label: "Últimos 90 dias" },
  { id: "mtd", label: "Mês atual" },
  { id: "lastmonth", label: "Mês anterior" },
  { id: "qtd", label: "Trimestre atual" },
  { id: "ytd", label: "Ano atual" },
  { id: "365d", label: "Últimos 12 meses" },
  { id: "custom", label: "Personalizado" },
] as const;
export type PresetId = (typeof PRESETS)[number]["id"];

export function presetRange(id: PresetId, today = todayLocal()): { from: string; to: string } {
  const firstOfMonth = `${today.slice(0, 8)}01`;
  switch (id) {
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    case "365d":
      return { from: addDays(today, -364), to: today };
    case "mtd":
      return { from: firstOfMonth, to: today };
    case "lastmonth": {
      const lastPrev = addDays(firstOfMonth, -1);
      return { from: `${lastPrev.slice(0, 8)}01`, to: lastPrev };
    }
    case "qtd": {
      const m = Number(today.slice(5, 7));
      const qm = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: `${today.slice(0, 4)}-${String(qm).padStart(2, "0")}-01`, to: today };
    }
    case "ytd":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default:
      return { from: addDays(today, -29), to: today };
  }
}
