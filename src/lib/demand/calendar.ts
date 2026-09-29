/**
 * Calendário inteligente da demanda.
 * - Feriados nacionais (fixos + móveis via Páscoa), pontos facultativos relevantes.
 * - Datas comemorativas com peso calibrado para restaurante japonês
 *   (Dia dos Namorados = pico máximo, Dia das Mães, Sexta Santa do peixe etc.).
 * - Folha: salário no 5º dia útil (CLT) e vale/adiantamento no dia 20
 *   (ajustados para o dia útil anterior).
 * - "Pontes" de feriado (segunda antes de feriado de terça, sexta depois de
 *   feriado de quinta) — cidade esvazia, salão cai.
 *
 * Multiplicadores "prior": palpite inicial honesto para restaurante de sushi em
 * cidade grande. Conforme o histórico acumula, o motor (engine.ts) substitui o
 * palpite pelo observado na SUA operação (shrinkage bayesiano).
 */

export type EventKind = "feriado" | "comemorativa" | "pagamento" | "ponte" | "custom";

export type CalEvent = {
  /** chave estável da família (ex.: "namorados", "payday") — usada no aprendizado */
  key: string;
  date: string; // YYYY-MM-DD
  title: string;
  kind: EventKind;
  /** palpite inicial de demanda (1 = dia normal) */
  prior: number;
  /** dias de efeito ao redor da data (ex.: véspera aquecida) */
  windowBefore: number;
  windowAfter: number;
  desc: string;
  system: boolean;
  /** dias reais afetados (janela expandida) */
  days: string[];
};

export type DayMark = {
  date: string;
  events: CalEvent[];
  isPayday: boolean;
  isAdvance: boolean;
  inPayWindow: boolean; // salário + 2 dias
  inAdvanceWindow: boolean; // vale + 1 dia
  isHoliday: boolean;
  isBridge: boolean;
};

const p2 = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${p2(m)}-${p2(d)}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const fmtD = (d: Date) => iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
export const addDaysIso = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return fmtD(d);
};
export const diffDaysIso = (a: string, b: string) =>
  Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
export const weekdayIso = (s: string) => parse(s).getDay(); // 0=Dom
export const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const fmtShort = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
export const fmtLong = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

/** N-ésimo dia da semana do mês (ex.: 2º domingo de maio). weekday 0=Dom. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(year, month - 1, 1);
  const delta = (weekday - first.getDay() + 7) % 7;
  return iso(year, month, 1 + delta + (n - 1) * 7);
}

/** Último dia da semana do mês (ex.: Black Friday = 4ª sexta de novembro). */
function lastWeekday(year: number, month: number, weekday: number): string {
  const last = new Date(year, month, 0).getDate();
  const d = new Date(year, month - 1, last);
  const delta = (d.getDay() - weekday + 7) % 7;
  return iso(year, month, last - delta);
}

type HolidayDef = { date: string; name: string; prior: number; desc: string };

/** Feriados nacionais + pontos facultativos de grande impacto. */
export function holidaysOf(year: number): HolidayDef[] {
  const easter = easterSunday(year);
  return [
    { date: iso(year, 1, 1), name: "Ano-Novo", prior: 0.65, desc: "Cidade lenta no dia 1º; movimento cai no salão." },
    { date: addDaysIso(easter, -48), name: "Segunda de Carnaval", prior: 0.85, desc: "Ponto facultativo; parte da cidade viaja." },
    { date: addDaysIso(easter, -47), name: "Terça de Carnaval", prior: 0.85, desc: "Ponto facultativo; salão mais fraco." },
    { date: addDaysIso(easter, -2), name: "Sexta-feira Santa", prior: 1.35, desc: "Dia do peixe: procura por sushi e peixaria dispara." },
    { date: easter, name: "Domingo de Páscoa", prior: 1.25, desc: "Almoço em família; rodízio e delivery aquecidos." },
    { date: iso(year, 4, 21), name: "Tiradentes", prior: 0.95, desc: "Feriado de meio de semana; movimento próximo do normal." },
    { date: iso(year, 5, 1), name: "Dia do Trabalhador", prior: 0.95, desc: "Famílias almoçam fora; jantar normal." },
    { date: addDaysIso(easter, 60), name: "Corpus Christi", prior: 0.9, desc: "Quinta santa; ponte comum na sexta." },
    { date: iso(year, 9, 7), name: "Independência", prior: 0.95, desc: "Feriadão de setembro; fim de semana estendido." },
    { date: iso(year, 10, 12), name: "N. Sra. Aparecida / Dia das Crianças", prior: 1.25, desc: "Famílias com crianças; almoço forte." },
    { date: iso(year, 11, 2), name: "Finados", prior: 0.9, desc: "Dia reflexivo; movimento contido." },
    { date: iso(year, 11, 15), name: "Proclamação da República", prior: 0.95, desc: "Feriadão de novembro." },
    { date: iso(year, 11, 20), name: "Consciência Negra", prior: 0.95, desc: "Feriado nacional; impacto leve." },
    { date: iso(year, 12, 24), name: "Véspera de Natal", prior: 1.4, desc: "Ceias e encomendas; retiradas e delivery disparam." },
    { date: iso(year, 12, 25), name: "Natal", prior: 0.6, desc: "Restaurante abre, mas o movimento é o mais fraco do ano." },
    { date: iso(year, 12, 31), name: "Véspera de Ano-Novo", prior: 1.5, desc: "Festas e encomendas; pico de retiradas." },
  ];
}

/** Datas comemorativas (não feriados) com impacto em restaurante. */
export function commemorativeOf(year: number): (HolidayDef & { key: string; before?: number; after?: number })[] {
  const mothers = nthWeekday(year, 5, 0, 2);
  const fathers = nthWeekday(year, 8, 0, 2);
  return [
    { key: "namorados", date: iso(year, 6, 12), name: "Dia dos Namorados", prior: 1.9, desc: "O maior pico do ano no jantar: casais lotam o salão." },
    { key: "maes", date: mothers, name: "Dia das Mães", prior: 1.7, desc: "Maior almoço do ano; famílias grandes, espera longa." },
    { key: "pais", date: fathers, name: "Dia dos Pais", prior: 1.5, desc: "Almoço de domingo muito forte." },
    { key: "mulher", date: iso(year, 3, 8), name: "Dia da Mulher", prior: 1.15, desc: "Jantar e delivery acima do normal." },
    { key: "saojoao", date: iso(year, 6, 24), name: "São João", prior: 1.1, desc: "Festas juninas; movimento levemente maior." },
    { key: "halloween", date: iso(year, 10, 31), name: "Halloween", prior: 1.05, desc: "Noite temática; leve alta no delivery." },
    { key: "blackfriday", date: lastWeekday(year, 11, 5), name: "Black Friday", prior: 1.05, desc: "Comércio aquecido; delivery acompanha." },
    { key: "finados-eve", date: iso(year, 11, 1), name: "Véspera de Finados", prior: 1.05, desc: "Feriadão começando; fim de semana estendido.", before: 0, after: 0 },
  ];
}

function keyOfHoliday(name: string): string {
  const map: Record<string, string> = {
    "Ano-Novo": "anonovo",
    "Segunda de Carnaval": "carnaval",
    "Terça de Carnaval": "carnaval",
    "Sexta-feira Santa": "sexta-santa",
    "Domingo de Páscoa": "pascoa",
    Tiradentes: "tiradentes",
    "Dia do Trabalhador": "trabalhador",
    "Corpus Christi": "corpus",
    "Independência": "independencia",
    "N. Sra. Aparecida / Dia das Crianças": "aparecida",
    Finados: "finados",
    "Proclamação da República": "proclamacao",
    "Consciência Negra": "consciencia",
    "Véspera de Natal": "natal-eve",
    Natal: "natal",
    "Véspera de Ano-Novo": "reveillon-eve",
  };
  return map[name] ?? name.toLowerCase().normalize("NFD").replace(/[^a-z]+/g, "-");
}

/** Dias úteis contam seg–sex exceto feriados/pontos. */
export function isBusinessDay(date: string, holidaySet: Set<string>): boolean {
  const w = weekdayIso(date);
  if (w === 0 || w === 6) return false;
  return !holidaySet.has(date);
}

/**
 * Salário CLT: até o 5º dia útil do mês. Retorna também a data de crédito
 * (se o 5º dia útil cair em sábado, antecipa para sexta — sem efeito aqui pois
 * dia útil nunca é fim de semana; feriado já está excluído).
 */
export function paydayOf(year: number, month: number, holidaySet: Set<string>): string {
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(year, month - 1, d);
    if (dt.getMonth() !== month - 1) break;
    if (isBusinessDay(fmtD(dt), holidaySet)) {
      count++;
      if (count === 5) return fmtD(dt);
    }
  }
  return iso(year, month, 5);
}

/** Vale/adiantamento: dia fixo, antecipado para o dia útil anterior se cair em fim de semana/feriado. */
export function advanceOf(year: number, month: number, advanceDay: number, holidaySet: Set<string>): string {
  const last = new Date(year, month, 0).getDate();
  const d = new Date(year, month - 1, Math.min(advanceDay, last));
  while (!isBusinessDay(fmtD(d), holidaySet)) d.setDate(d.getDate() - 1);
  return fmtD(d);
}

export type CustomEventRow = {
  id: string;
  title: string;
  kind: string;
  systemKey: string | null;
  date: string | null;
  month: number | null;
  day: number | null;
  multiplier: string;
  windowBefore: number;
  windowAfter: number;
  active: boolean;
  notes: string | null;
};

/**
 * Gera todos os eventos do sistema para os anos dados + aplica overrides e
 * soma eventos personalizados. Retorna eventos com janela de dias expandida.
 */
export function buildCalendar(
  years: number[],
  custom: CustomEventRow[],
  advanceDay: number
): { events: CalEvent[]; marks: Map<string, DayMark>; holidays: Set<string> } {
  const events: CalEvent[] = [];
  const holidays = new Set<string>();

  for (const year of years) {
    for (const h of holidaysOf(year)) {
      holidays.add(h.date);
      events.push({
        key: keyOfHoliday(h.name),
        date: h.date,
        title: h.name,
        kind: "feriado",
        prior: h.prior,
        windowBefore: 0,
        windowAfter: 0,
        desc: h.desc,
        system: true,
        days: [h.date],
      });
    }
    for (const c of commemorativeOf(year)) {
      events.push({
        key: c.key,
        date: c.date,
        title: c.name,
        kind: "comemorativa",
        prior: c.prior,
        windowBefore: c.before ?? 0,
        windowAfter: c.after ?? 0,
        desc: c.desc,
        system: true,
        days: [c.date],
      });
    }
    // Folha: salário + vale por mês
    const yearHolidays = new Set(holidaysOf(year).map((h) => h.date));
    for (let m = 1; m <= 12; m++) {
      const pay = paydayOf(year, m, yearHolidays);
      events.push({
        key: "payday",
        date: pay,
        title: "Pagamento de salários (5º dia útil)",
        kind: "pagamento",
        prior: 1.12,
        windowBefore: 0,
        windowAfter: 2,
        desc: "Cliente com dinheiro no bolso: salão e delivery sobem por ~3 dias.",
        system: true,
        days: [pay, addDaysIso(pay, 1), addDaysIso(pay, 2)],
      });
      const adv = advanceOf(year, m, advanceDay, yearHolidays);
      if (adv !== pay) {
        events.push({
          key: "advance",
          date: adv,
          title: `Vale / adiantamento (dia ${advanceDay})`,
          kind: "pagamento",
          prior: 1.07,
          windowBefore: 0,
          windowAfter: 1,
          desc: "Adiantamento quinzenal aquece o meio do mês.",
          system: true,
          days: [adv, addDaysIso(adv, 1)],
        });
      }
    }
    // Pontes: segunda antes de feriado de terça / sexta depois de feriado de quinta
    for (const h of holidaysOf(year)) {
      const w = weekdayIso(h.date);
      if (w === 2) {
        const mon = addDaysIso(h.date, -1);
        events.push({
          key: "ponte",
          date: mon,
          title: `Ponte do feriado (${h.name})`,
          kind: "ponte",
          prior: 0.88,
          windowBefore: 0,
          windowAfter: 0,
          desc: "Segunda esvaziada por emenda de feriado; salão cai.",
          system: true,
          days: [mon],
        });
      }
      if (w === 4) {
        const fri = addDaysIso(h.date, 1);
        events.push({
          key: "ponte",
          date: fri,
          title: `Ponte do feriado (${h.name})`,
          kind: "ponte",
          prior: 0.88,
          windowBefore: 0,
          windowAfter: 0,
          desc: "Sexta esvaziada por emenda de feriado.",
          system: true,
          days: [fri],
        });
      }
    }
  }

  // Overrides de eventos do sistema (desligar ou recalibrar o palpite)
  const bySystemKey = new Map(events.filter((e) => e.system).map((e) => [e.key, e] as const));
  for (const c of custom) {
    if (c.systemKey && bySystemKey.has(c.systemKey)) {
      // aplicado por família na montagem das marcas (multiplicador/ativo)
    }
  }
  const override = new Map(custom.filter((c) => c.systemKey).map((c) => [c.systemKey as string, c]));

  // Eventos personalizados
  for (const c of custom) {
    if (c.systemKey || !c.active) continue;
    const dates: string[] = [];
    if (c.date) {
      if (years.includes(Number(c.date.slice(0, 4)))) dates.push(c.date);
    } else if (c.month && c.day) {
      for (const y of years) {
        const last = new Date(y, c.month, 0).getDate();
        if (c.day <= last) dates.push(iso(y, c.month, c.day));
      }
    }
    for (const dt of dates) {
      const days: string[] = [];
      for (let i = -c.windowBefore; i <= c.windowAfter; i++) days.push(addDaysIso(dt, i));
      events.push({
        key: `custom:${c.id}`,
        date: dt,
        title: c.title,
        kind: (c.kind as EventKind) || "custom",
        prior: Number(c.multiplier) || 1.3,
        windowBefore: c.windowBefore,
        windowAfter: c.windowAfter,
        desc: c.notes || "Evento cadastrado pela casa.",
        system: false,
        days,
      });
    }
  }

  // Marcas por dia
  const marks = new Map<string, DayMark>();
  const ensure = (date: string): DayMark => {
    let m = marks.get(date);
    if (!m) {
      m = { date, events: [], isPayday: false, isAdvance: false, inPayWindow: false, inAdvanceWindow: false, isHoliday: false, isBridge: false };
      marks.set(date, m);
    }
    return m;
  };
  for (const e of events) {
    const ov = e.system ? override.get(e.key) : undefined;
    if (ov && !ov.active) continue; // família desligada
    const eff: CalEvent = ov
      ? { ...e, prior: Number(ov.multiplier) || e.prior, title: ov.title || e.title }
      : e;
    for (const d of eff.days) {
      const m = ensure(d);
      if (!m.events.some((x) => x.key === eff.key && x.date === eff.date)) m.events.push(eff);
      if (eff.key === "payday") {
        m.inPayWindow = true;
        if (d === eff.date) m.isPayday = true;
      }
      if (eff.key === "advance") {
        m.inAdvanceWindow = true;
        if (d === eff.date) m.isAdvance = true;
      }
      if (eff.kind === "feriado" && d === eff.date) m.isHoliday = true;
      if (eff.kind === "ponte") m.isBridge = true;
    }
  }
  return { events, marks, holidays };
}

/** Multiplicador combinado de eventos num dia (produto dos priors, com teto). */
export function combinedPrior(mark: DayMark | undefined): number {
  if (!mark || mark.events.length === 0) return 1;
  // pagamento entra separado no motor; aqui só feriado/comemorativa/ponte/custom
  const nonPay = mark.events.filter((e) => e.key !== "payday" && e.key !== "advance");
  if (nonPay.length === 0) return 1;
  const prod = nonPay.reduce((a, e) => a * e.prior, 1);
  return Math.min(2.4, Math.max(0.5, prod));
}
