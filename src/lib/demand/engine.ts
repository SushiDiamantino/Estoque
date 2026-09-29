import { db } from "@/db";
import { demandEvents } from "@/db/schema";
import { sql } from "drizzle-orm";
import { getSettings } from "@/lib/settings";
import { loadConsumption, purchaseCycle, spreadOverPeriods, type ConsumptionData } from "./consumption";
import {
  addDaysIso,
  buildCalendar,
  combinedPrior,
  diffDaysIso,
  fmtLong,
  fmtShort,
  weekdayIso,
  type CalEvent,
  type CustomEventRow,
  type DayMark,
} from "./calendar";

const PERDAS = ["Perda / quebra", "Vencimento", "Avaria"];
const AJUSTE = "Ajuste de inventário";
const DISCRETE = new Set(["un", "cx", "pct", "saco", "fardo", "pote", "bloco", "peça", "g", "ml"]);

// Prior de dia da semana [Dom..Sáb] — restaurante japonês, salão + delivery.
const DOW_PRIOR = [1.12, 0.72, 0.78, 0.88, 1.02, 1.45, 1.58];
export const DOW_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const DOW_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
// Prior mensal (1..12)
const MONTH_PRIOR = [0.95, 0.92, 1.0, 1.02, 1.08, 1.05, 1.0, 1.03, 1.0, 1.04, 1.0, 1.1];
export const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
/** Shrinkage: com poucas amostras o palpite domina; com muitas, o observado. */
const shrink = (obs: number, prior: number, n: number, k: number) => {
  const w = n / (n + k);
  return w * obs + (1 - w) * prior;
};
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

export type DemandLevel = "muito_alta" | "alta" | "normal" | "baixa" | "muito_baixa";
export type Urgency = "critical" | "high" | "normal";

export type DayForecast = {
  date: string;
  label: string;
  weekday: number;
  weekdayName: string;
  isWeekend: boolean;
  events: { key: string; title: string; kind: string; mult: number; learned: boolean; samples: number; lastYearMult: number | null }[];
  isPayday: boolean;
  isAdvance: boolean;
  inPayWindow: boolean;
  inAdvanceWindow: boolean;
  isHoliday: boolean;
  dowFactor: number;
  monthFactor: number;
  paydayFactor: number;
  eventFactor: number;
  index: number;
  value: number;
  low: number;
  high: number;
  confidence: number;
  level: DemandLevel;
  ruptures: number;
};

export type ShoppingItem = {
  itemId: string;
  name: string;
  sku: string;
  unit: string;
  category: string | null;
  stock: number;
  /** Saldo descontando o que é de empréstimo e precisa voltar. */
  stockEffective: number;
  owedOut: number;
  owedIn: number;
  min: number;
  avgDaily: number;
  leadTime: number;
  needTotal: number;
  suggestion: number;
  suggestionValue: number;
  coverageDays: number | null;
  ruptureDate: string | null;
  orderBy: string | null;
  urgency: Urgency;
  reasons: string[];
  noHistory: boolean;
};

export type DemandOverview = {
  generatedAt: string;
  today: string;
  horizon: number;
  targetDays: number;
  hasHistory: boolean;
  learning: {
    level: "inicial" | "em_formacao" | "solido" | "maduro";
    levelLabel: string;
    score: number;
    historyDays: number;
    observedDays: number;
    coverage: number;
    firstDate: string | null;
    movements: number;
    weeksObserved: number;
    paydayCycles: number;
    eventsObserved: number;
    daysSinceLast: number | null;
    missingDays: string[];
  };
  factors: {
    dow: { dow: number; name: string; factor: number; prior: number; samples: number }[];
    monthly: { month: number; name: string; factor: number; prior: number; samples: number }[];
    payday: { factor: number; prior: number; samples: number };
    advance: { factor: number; prior: number; samples: number };
    trendPctMonth: number | null;
    baseDaily: number;
  };
  eventLearning: { key: string; title: string; learned: number; prior: number; samples: number; lastSeen: string | null; nextDate: string | null }[];
  calendar: DayForecast[];
  peaks: { date: string; label: string; title: string; mult: number; value: number; daysLeft: number; ruptures: number; purchaseValue: number }[];
  summary: {
    avgIndex7: number;
    avgIndex14: number;
    projectedValue: number;
    nextPeak: { date: string; label: string; title: string; mult: number; daysLeft: number } | null;
    paydayNext: { date: string; label: string; daysLeft: number } | null;
    advanceNext: { date: string; label: string; daysLeft: number } | null;
    weekendBoost: number;
  };
  consumption: {
    mode: "diario" | "misto" | "periodo";
    modeLabel: string;
    recordingDays: number;
    coverage: number;
    avgPeriodDays: number;
    maxGapDays: number;
    spreadApplied: boolean;
    anchorEnabled: boolean;
    anchorCounts: number;
    lastCountDate: string | null;
    anchorFactor: number;
    missingValue: number;
    surplusValue: number;
    itemsAdjusted: number;
  };
  purchase: {
    days: number[];
    dayNames: string[];
    source: "configurado" | "historico" | "padrao";
    nextDate: string | null;
    followingDate: string | null;
    daysToNext: number | null;
    coverDays: number;
    emergencyRate: number;
    totalBuys: number;
    byDow: number[];
  };
  loans: { owedOutItems: number; owedInItems: number };
  shopping: ShoppingItem[];
  shoppingTotal: number;
  criticalCount: number;
  insights: { tone: "good" | "warn" | "bad" | "info"; title: string; text: string }[];
};

const levelOf = (idx: number): DemandLevel =>
  idx >= 1.6 ? "muito_alta" : idx >= 1.25 ? "alta" : idx >= 0.85 ? "normal" : idx >= 0.6 ? "baixa" : "muito_baixa";

export async function getDemandOverview(horizonInput?: number, targetInput?: number | null): Promise<DemandOverview> {
  const s = await getSettings();
  const horizon = clamp(Math.round(horizonInput ?? s.demandHorizonDays ?? 45), 7, 120);
  const autoTarget = targetInput === undefined || targetInput === null;
  const explicitTarget = autoTarget ? 0 : clamp(Math.round(targetInput), 3, 90);
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const dowPriorMean0 = DOW_PRIOR.reduce((a, b) => a + b, 0) / 7;
  const priorWeights = DOW_PRIOR.map((p) => p / dowPriorMean0);

  const [consumption0, masterRes, customRes] = await Promise.all([
    loadConsumption({
      todayIso,
      spread: s.spreadConsumption ?? true,
      anchor: s.inventoryAnchor ?? true,
      weights: priorWeights,
    }),
    db.execute(sql`
      select i.id, i.name, i.sku, i.unit, i.min_stock::numeric as min,
        coalesce(i.cost_price, 0)::numeric as cost, coalesce(i.lead_time_days, 0)::int as lead,
        c.name as category, coalesce(sum(sb.quantity::numeric), 0) as stock
      from items i
      left join categories c on c.id = i.category_id
      left join stock_balances sb on sb.item_id = i.id
      where i.active = true
      group by i.id, i.name, i.sku, i.unit, i.min_stock, i.cost_price, i.lead_time_days, c.name
      order by i.name
    `),
    db.select().from(demandEvents),
  ]);

  let consumption: ConsumptionData = consumption0;
  type DailyRow = { d: string; v: number };
  let daily: DailyRow[] = consumption.series.map((r) => ({ d: r.date, v: r.value }));
  const recordingDays = consumption.recordDates.length;
  const observedDays = daily.length;
  const firstDate = consumption.quality.firstDate;
  const spanDays = consumption.quality.spanDays;
  const movements = recordingDays;
  const hasHistory = recordingDays >= 3;
  const custom = customRes as unknown as CustomEventRow[];

  const years = new Set<number>([Number(todayIso.slice(0, 4))]);
  for (let i = 1; i <= horizon; i++) years.add(Number(addDaysIso(todayIso, i).slice(0, 4)));
  if (firstDate) {
    years.add(Number(firstDate.slice(0, 4)));
    const mid = Number(addDaysIso(firstDate, Math.floor(spanDays / 2)).slice(0, 4));
    years.add(mid);
  }
  const { marks } = buildCalendar([...years].sort(), custom, s.advanceDay ?? 20);
  const markOf = (d: string): DayMark | undefined => marks.get(d);
  // calendário estendido (2 anos) só para localizar a próxima ocorrência de cada data
  const curYear = Number(todayIso.slice(0, 4));
  const { events: futureEvents } = buildCalendar([curYear, curYear + 1, curYear + 2], custom, s.advanceDay ?? 20);
  const nextOf = (key: string): string | null => {
    let best: string | null = null;
    for (const e of futureEvents) {
      if (e.key !== key || e.date <= todayIso) continue;
      if (!best || e.date < best) best = e.date;
    }
    return best;
  };

  // Dias fortes de evento saem da linha de base (não contaminam dia de semana/mês/tendência)
  const isStrongEvent = (d: string) => {
    const m = markOf(d);
    if (!m) return false;
    return Math.abs(combinedPrior(m) - 1) >= 0.2;
  };
  const baseline = daily.filter((r) => !isStrongEvent(r.d));
  const gMean = baseline.length ? mean(baseline.map((r) => num(r.v))) : observedDays ? mean(daily.map((r) => num(r.v))) : 0;

  // ---- Fatores de dia da semana (prior normalizado)
  const dowPriorMean = mean(DOW_PRIOR);
  const dowPrior = DOW_PRIOR.map((p) => p / dowPriorMean);
  const dow = DOW_PRIOR.map((_, w) => {
    const vals = baseline.filter((r) => weekdayIso(r.d) === w).map((r) => num(r.v));
    const obs = vals.length && gMean > 0 ? mean(vals) / gMean : dowPrior[w];
    return { factor: shrink(obs, dowPrior[w], vals.length, 8), prior: dowPrior[w], samples: vals.length };
  });
  const dowMean = mean(dow.map((d) => d.factor));
  dow.forEach((d) => (d.factor = d.factor / (dowMean || 1)));

  // 2ª passada: com o ritmo semanal já aprendido, redistribui os lançamentos em bloco
  // pelos dias do período de forma mais fiel (o total de cada lançamento é preservado).
  if (consumption.quality.spreadApplied && recordingDays >= 7) {
    const w = dow.map((d) => d.factor);
    const reSeries = spreadOverPeriods(consumption.rawValue, w, todayIso);
    const reItems = new Map<string, Map<string, number>>();
    for (const [itemId, recs] of consumption.rawItems) reItems.set(itemId, spreadOverPeriods(recs, w, todayIso));
    const reTotals = new Map(consumption.itemTotals);
    for (const [itemId, m] of reItems) {
      const prev = reTotals.get(itemId);
      if (prev) reTotals.set(itemId, { ...prev, qty: [...m.values()].reduce((a, b) => a + b, 0) });
    }
    consumption = {
      ...consumption,
      series: [...reSeries.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)),
      itemDaily: reItems,
      itemTotals: reTotals,
    };
    daily = consumption.series.map((r) => ({ d: r.date, v: r.value }));
  }

  // ---- Fatores mensais
  const monPriorMean = mean(MONTH_PRIOR);
  const monPrior = MONTH_PRIOR.map((p) => p / monPriorMean);
  const monthly = MONTH_PRIOR.map((_, i) => {
    const m = i + 1;
    const res = baseline
      .filter((r) => Number(r.d.slice(5, 7)) === m)
      .map((r) => (gMean > 0 ? num(r.v) / (gMean * dow[weekdayIso(r.d)].factor) : 1));
    const obs = res.length ? mean(res) : monPrior[i];
    return { factor: shrink(obs, monPrior[i], res.length, 6), prior: monPrior[i], samples: res.length };
  });
  const monMean = mean(monthly.map((d) => d.factor));
  monthly.forEach((d) => (d.factor = d.factor / (monMean || 1)));

  // ---- Efeito folha (resíduo após dia/mês)
  const resid = (r: DailyRow) => {
    const denom = gMean * dow[weekdayIso(r.d)].factor * monthly[Number(r.d.slice(5, 7)) - 1].factor;
    return denom > 0 ? num(r.v) / denom : 1;
  };
  const payDays = baseline.filter((r) => markOf(r.d)?.inPayWindow);
  const advDays = baseline.filter((r) => markOf(r.d)?.inPayWindow === false && markOf(r.d)?.inAdvanceWindow);
  const plainDays = baseline.filter((r) => !markOf(r.d)?.inPayWindow && !markOf(r.d)?.inAdvanceWindow);
  const plainMean = plainDays.length ? mean(plainDays.map(resid)) : 1;
  const payObs = payDays.length && plainMean > 0 ? mean(payDays.map(resid)) / plainMean : 1.12;
  const advObs = advDays.length && plainMean > 0 ? mean(advDays.map(resid)) / plainMean : 1.07;
  const payFactor = shrink(clamp(payObs, 0.8, 1.6), 1.12, payDays.length, 12);
  const advFactor = shrink(clamp(advObs, 0.8, 1.5), 1.07, advDays.length, 12);
  const paydayAdj = (d: string) => {
    const m = markOf(d);
    if (!m) return 1;
    if (m.inPayWindow) return payFactor;
    if (m.inAdvanceWindow) return advFactor;
    return 1;
  };

  // ---- Tendência (regressão sobre série dessazonalizada, últimos 180 dias)
  const since180 = addDaysIso(todayIso, -179);
  const trendPts = baseline
    .filter((r) => r.d >= since180)
    .map((r) => {
      const denom = dow[weekdayIso(r.d)].factor * monthly[Number(r.d.slice(5, 7)) - 1].factor * paydayAdj(r.d);
      return { x: firstDate ? diffDaysIso(firstDate, r.d) : 0, y: denom > 0 ? num(r.v) / denom : 0 };
    });
  let slope = 0;
  let intercept = gMean || 0;
  let r2: number | null = null;
  if (trendPts.length >= 14 && gMean > 0) {
    const xb = mean(trendPts.map((p) => p.x));
    const yb = mean(trendPts.map((p) => p.y));
    let sxy = 0;
    let sxx = 0;
    for (const p of trendPts) {
      sxy += (p.x - xb) * (p.y - yb);
      sxx += (p.x - xb) ** 2;
    }
    slope = sxx > 0 ? sxy / sxx : 0;
    slope = clamp(slope, -0.005 * gMean, 0.005 * gMean);
    intercept = yb - slope * xb;
    const ssRes = trendPts.reduce((a, p) => a + (p.y - (intercept + slope * p.x)) ** 2, 0);
    const ssTot = trendPts.reduce((a, p) => a + (p.y - yb) ** 2, 0);
    r2 = ssTot > 0 ? clamp(1 - ssRes / ssTot, 0, 1) : null;
  } else if (trendPts.length > 0) {
    intercept = mean(trendPts.map((p) => p.y));
  }
  const xOf = (d: string) => (firstDate ? diffDaysIso(firstDate, d) : 0);
  const baseAt = (d: string) => Math.max(0.15 * (gMean || 1), intercept + slope * xOf(d));
  const trendPctMonth = gMean > 0 && trendPts.length >= 14 ? (slope * 30) / gMean : null;

  // ---- Incerteza (resíduos na linha de base)
  const residVals = baseline.map((r) => num(r.v) - baseAt(r.d) * dow[weekdayIso(r.d)].factor * monthly[Number(r.d.slice(5, 7)) - 1].factor * paydayAdj(r.d));
  const sigma = Math.max(0.08 * gMean, std(residVals));

  // ---- Aprendizado por família de evento (dias-âncora)
  type FamStat = { key: string; title: string; prior: number; ratios: number[]; dates: string[] };
  const fams = new Map<string, FamStat>();
  for (const r of daily) {
    const m = markOf(r.d);
    if (!m) continue;
    for (const e of m.events) {
      if (e.date !== r.d) continue; // só o dia-âncora ensina
      if (e.key === "payday" || e.key === "advance") continue; // folha tem canal próprio
      let f = fams.get(e.key);
      if (!f) {
        f = { key: e.key, title: e.title, prior: e.prior, ratios: [], dates: [] };
        fams.set(e.key, f);
      }
      const expected = baseAt(r.d) * dow[weekdayIso(r.d)].factor * monthly[Number(r.d.slice(5, 7)) - 1].factor * paydayAdj(r.d);
      if (expected > 0) {
        f.ratios.push(num(r.v) / expected);
        f.dates.push(r.d);
      }
    }
  }
  const learnedOf = (e: CalEvent): { mult: number; samples: number; learned: boolean } => {
    const f = fams.get(e.key);
    if (!f || f.ratios.length === 0) return { mult: e.prior, samples: 0, learned: false };
    return { mult: shrink(mean(f.ratios), e.prior, f.ratios.length, 2), samples: f.ratios.length, learned: true };
  };
  const lastYearOf = (key: string, refDate: string): number | null => {
    const f = fams.get(key);
    if (!f) return null;
    let best: number | null = null;
    let bestDist = Infinity;
    f.dates.forEach((dt, i) => {
      const dist = Math.abs(Math.abs(diffDaysIso(dt, refDate)) - 365);
      if (dist < bestDist && dist <= 12) {
        bestDist = dist;
        best = f.ratios[i];
      }
    });
    return best;
  };

  // ---- Confiança geral
  const minDowSamples = Math.min(...dow.map((d) => d.samples));
  const famObserved = [...fams.values()].filter((f) => f.ratios.length > 0).length;
  const lastRecord = consumption.recordDates.length ? consumption.recordDates[consumption.recordDates.length - 1] : null;
  const daysSinceLast = lastRecord ? diffDaysIso(lastRecord, todayIso) : null;
  const coverage = spanDays > 0 ? observedDays / spanDays : 0;
  const paydayCycles = Math.floor(observedDays / 30);
  const score = Math.round(
    (observedDays >= 365 ? 40 : observedDays >= 180 ? 30 : observedDays >= 90 ? 22 : observedDays >= 30 ? 14 : observedDays >= 7 ? 8 : 2) +
      (minDowSamples >= 8 ? 20 : minDowSamples >= 4 ? 14 : minDowSamples >= 2 ? 8 : 3) +
      (famObserved >= 6 ? 15 : famObserved >= 3 ? 10 : famObserved >= 1 ? 6 : 2) +
      (daysSinceLast === null ? 0 : daysSinceLast <= 1 ? 15 : daysSinceLast <= 3 ? 10 : daysSinceLast <= 7 ? 5 : 0) +
      (coverage >= 0.9 ? 10 : coverage >= 0.7 ? 7 : coverage >= 0.4 ? 4 : 1)
  );
  const level = score >= 80 && observedDays >= 330 ? "maduro" : score >= 60 ? "solido" : score >= 40 ? "em_formacao" : "inicial";
  const levelLabel = level === "maduro" ? "Maduro — ano contra ano" : level === "solido" ? "Sólido" : level === "em_formacao" ? "Em formação" : "Inicial";

  // Dias recentes sem lançamento (quebram o aprendizado)
  const recordSet = new Set(consumption.recordDates);
  const missingDays: string[] = [];
  if (consumption.quality.mode === "diario") {
    for (let i = 1; i <= 14; i++) {
      const d = addDaysIso(todayIso, -i);
      if (d < (firstDate ?? todayIso)) continue;
      if (!recordSet.has(d)) missingDays.push(d);
    }
  }
  const staleLimit = Math.max(3, Math.ceil(consumption.quality.avgPeriodDays * 2));
  const lancamentoAtrasado = daysSinceLast !== null && daysSinceLast > staleLimit;

  // ---- Projeção dia a dia
  const calendar: DayForecast[] = [];
  for (let i = 0; i < horizon; i++) {
    const date = addDaysIso(todayIso, i);
    const w = weekdayIso(date);
    const m = markOf(date);
    const evts = (m?.events ?? [])
      .filter((e) => e.key !== "payday" && e.key !== "advance")
      .filter((e, idx, arr) => arr.findIndex((x) => x.key === e.key) === idx);
    let eventFactor = 1;
    const evList = evts.map((e) => {
      const { mult, samples, learned } = learnedOf(e);
      const anchor = e.date === date;
      const strength = anchor ? 1 : 0.5;
      const f = 1 + (mult - 1) * strength;
      eventFactor *= f;
      return { key: e.key, title: e.title, kind: e.kind, mult, learned, samples, lastYearMult: lastYearOf(e.key, date) };
    });
    eventFactor = clamp(eventFactor, 0.4, 2.6);
    const df = dow[w].factor;
    const mf = monthly[Number(date.slice(5, 7)) - 1].factor;
    const pf = paydayAdj(date);
    const base = baseAt(date);
    const value = hasHistory ? base * df * mf * pf * eventFactor : 0;
    // O indice (multiplicador) vale desde o dia 1: sem historico, os pesos do
    // segmento dominam; conforme os lancamentos acumulam, a sua operacao prevalece.
    const idx = df * mf * pf * eventFactor;
    const unobs = evList.some((e) => !e.learned);
    const daySigma = sigma * Math.sqrt(1 + i / 30) * (unobs ? 1.3 : 1);
    let conf = score - (i > 60 ? 20 : i > 30 ? 10 : 0) - (unobs ? 15 : evList.some((e) => e.samples <= 2) ? 8 : 0);
    if ((m?.inPayWindow || m?.inAdvanceWindow) && paydayCycles < 3) conf -= 5;
    conf = clamp(Math.round(conf), 5, 99);
    calendar.push({
      date,
      label: fmtShort(date),
      weekday: w,
      weekdayName: DOW_NAMES[w],
      isWeekend: w === 0 || w === 5 || w === 6,
      events: evList,
      isPayday: m?.isPayday ?? false,
      isAdvance: m?.isAdvance ?? false,
      inPayWindow: m?.inPayWindow ?? false,
      inAdvanceWindow: m?.inAdvanceWindow ?? false,
      isHoliday: m?.isHoliday ?? false,
      dowFactor: df,
      monthFactor: mf,
      paydayFactor: pf,
      eventFactor,
      index: idx,
      value,
      low: Math.max(0, value - 1.28 * daySigma),
      high: value + 1.28 * daySigma,
      confidence: hasHistory ? conf : 0,
      level: levelOf(idx),
      ruptures: 0,
    });
  }

  // ---- Itens + simulação de estoque + lista de compras
  type ItemRow = { id: string; name: string; sku: string; unit: string; min: string; cost: string; lead: number; category: string | null; stock: string };
  const items = masterRes.rows as ItemRow[];
  const cycle = purchaseCycle(s.purchaseDays ?? "", consumption.purchases.byDow, consumption.purchases.total, todayIso);
  // O pedido precisa durar até a reposição seguinte (2º dia de compra à frente).
  const cycleCoverDays = cycle.followingDate ? Math.max(1, diffDaysIso(todayIso, cycle.followingDate)) : 14;
  // Sem meta explícita, a cobertura é o próprio ciclo de compra da casa.
  const targetDays = autoTarget ? cycleCoverDays : explicitTarget;
  const trendToday = baseAt(todayIso);
  const trendRatio = (d: string) => (trendToday > 0 ? baseAt(d) / trendToday : 1);
  const coverEnd = addDaysIso(todayIso, Math.max(horizon, 0));

  const shopping: ShoppingItem[] = [];
  const ruptureByDate = new Map<string, number>();
  for (const it of items) {
    const stock = num(it.stock);
    const min = num(it.min);
    const agg = consumption.itemTotals.get(it.id);
    const total = agg?.qty ?? 0;
    const itemDays = agg?.days ?? Math.max(1, observedDays);
    const anchorFactor = consumption.anchor.itemFactor.get(it.id) ?? 1;
    const avgDaily = itemDays > 0 ? (total / itemDays) * anchorFactor : 0;
    const lead = num(it.lead);
    const loanPos = consumption.loans.get(it.id) ?? { owedOut: 0, owedIn: 0 };
    // O que pegamos emprestado está no saldo, mas é de outra casa: sai da disponibilidade.
    const stockEffective = Math.max(0, stock - loanPos.owedOut);
    const coverDays = Math.max(targetDays, cycleCoverDays);
    const coverUntil = addDaysIso(todayIso, coverDays + lead);
    const simEnd = coverUntil > coverEnd ? coverUntil : coverEnd;
    // necessidade dia a dia até cobrir lead + meta
    let need = 0;
    let run = stockEffective;
    let ruptureDate: string | null = null;
    const endIdx = diffDaysIso(todayIso, simEnd);
    const needIdx = diffDaysIso(todayIso, coverUntil);
    let maxMult = 1;
    const peakNames: string[] = [];
    for (let i = 1; i <= endIdx; i++) {
      const d = addDaysIso(todayIso, i);
      const cal = calendar.find((c) => c.date === d);
      const mult = cal ? cal.dowFactor * cal.monthFactor * cal.paydayFactor * cal.eventFactor : 1;
      const dayNeed = avgDaily * mult * trendRatio(d);
      run -= dayNeed;
      if (i <= needIdx) {
        need += dayNeed;
        if (mult > maxMult) maxMult = mult;
        if (cal && mult >= 1.3) {
          for (const e of cal.events) {
            if (e.mult >= 1.2 && !peakNames.includes(e.title) && peakNames.length < 2) peakNames.push(`${e.title} ${fmtShort(d)}`);
          }
        }
      }
      if (ruptureDate === null && run < 0 && avgDaily > 0) ruptureDate = d;
    }
    if (ruptureDate) ruptureByDate.set(ruptureDate, (ruptureByDate.get(ruptureDate) ?? 0) + 1);
    const noHistory = total <= 0;
    const shortHist = !noHistory && itemDays < 14;
    const safety = Math.min(
      0.4,
      0.08 + (maxMult >= 1.5 ? 0.12 : maxMult >= 1.3 ? 0.07 : 0) + (score < 40 ? 0.1 : score < 70 ? 0.05 : 0) + (shortHist ? 0.1 : 0)
    );
    let suggestion = noHistory
      ? Math.max(0, min - stockEffective)
      : Math.max(0, min + need * (1 + safety) - stockEffective);
    suggestion = DISCRETE.has(it.unit) ? Math.ceil(suggestion - 1e-9) : Math.ceil(suggestion * 10 - 1e-9) / 10;
    const coverageDays = avgDaily > 0 ? stockEffective / avgDaily : null;
    // prazo fatal do pedido: 1 dia de margem antes da ruptura menos o lead
    let orderBy: string | null = null;
    if (suggestion > 0) {
      if (ruptureDate) {
        const dl = addDaysIso(ruptureDate, -(lead + 1));
        orderBy = dl <= todayIso ? todayIso : dl;
      } else {
        orderBy = todayIso;
      }
    }
    const firstPeak = calendar.find((c) => c.index >= 1.4 && diffDaysIso(todayIso, c.date) <= lead + targetDays);
    const ruptureBeforePeak = ruptureDate !== null && firstPeak !== undefined && ruptureDate <= firstPeak.date;
    const urgency: Urgency =
      stock < min || ruptureBeforePeak || (ruptureDate !== null && diffDaysIso(todayIso, ruptureDate) <= lead + 2)
        ? "critical"
        : ruptureDate !== null || suggestion > 0
          ? "high"
          : "normal";
    const reasons: string[] = [];
    if (noHistory && suggestion > 0) reasons.push(`Sem histórico — cobre o mínimo (${min} ${it.unit})`);
    if (peakNames.length) reasons.push(`Pico: ${peakNames.join(" · ")}`);
    if (maxMult >= 1.3) reasons.push(`Demanda até ${Math.round((maxMult - 1) * 100)}% acima do normal no período`);
    if (loanPos.owedOut > 0) reasons.push(`${loanPos.owedOut.toLocaleString("pt-BR")} ${it.unit} são de empréstimo a devolver`);
    if (anchorFactor > 1.02) reasons.push(`Inventário apontou +${Math.round((anchorFactor - 1) * 100)}% de consumo não lançado`);
    if (shortHist) reasons.push(`Histórico curto do item (${itemDays}d) — margem extra`);
    if (cycleCoverDays > targetDays) reasons.push(`Cobre até a próxima compra (${cycle.followingDate ? fmtShort(cycle.followingDate) : "—"})`);
    if (lead > 0) reasons.push(`Lead time de ${lead}d + meta de ${targetDays}d`);
    if (safety >= 0.2) reasons.push(`Margem de segurança de ${Math.round(safety * 100)}% (pico e/ou base em formação)`);
    if (ruptureDate) reasons.push(`Zera em ${fmtLong(ruptureDate)} no ritmo projetado`);
    if (suggestion > 0) {
      shopping.push({
        itemId: it.id,
        name: it.name,
        sku: it.sku,
        unit: it.unit,
        category: it.category,
        stock,
        stockEffective,
        owedOut: loanPos.owedOut,
        owedIn: loanPos.owedIn,
        min,
        avgDaily,
        leadTime: lead,
        needTotal: need,
        suggestion,
        suggestionValue: suggestion * num(it.cost),
        coverageDays,
        ruptureDate,
        orderBy,
        urgency,
        reasons,
        noHistory,
      });
    }
  }
  shopping.sort((a, b) => {
    const rank = { critical: 0, high: 1, normal: 2 };
    if (rank[a.urgency] !== rank[b.urgency]) return rank[a.urgency] - rank[b.urgency];
    return b.suggestionValue - a.suggestionValue;
  });
  for (const c of calendar) c.ruptures = ruptureByDate.get(c.date) ?? 0;

  // ---- Picos
  const peaks = calendar
    .filter((c) => diffDaysIso(todayIso, c.date) >= 0 && c.index >= 1.3)
    .sort((a, b) => b.index - a.index)
    .slice(0, 8)
    .map((c) => {
      const main = c.events.sort((a, b) => b.mult - a.mult)[0];
      const title = main ? main.title : c.weekday === 6 ? "Sábado de pico" : c.weekday === 5 ? "Sexta de pico" : "Fim de semana aquecido";
      const purchaseValue = shopping.filter((sh) => sh.ruptureDate !== null && sh.ruptureDate <= c.date).reduce((a, sh) => a + sh.suggestionValue, 0);
      return { date: c.date, label: `${fmtShort(c.date)} · ${c.weekdayName}`, title, mult: c.index, value: c.value, daysLeft: diffDaysIso(todayIso, c.date), ruptures: c.ruptures, purchaseValue };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  // ---- Resumo
  const next7 = calendar.slice(0, 7);
  const next14 = calendar.slice(0, 14);
  const avgIdx = (arr: DayForecast[]) => (arr.length ? arr.reduce((a, c) => a + c.index, 0) / arr.length : 0);
  const nextPeakDay = [...calendar].sort((a, b) => diffDaysIso(todayIso, a.date) - diffDaysIso(todayIso, b.date)).find((c) => c.index >= 1.4);
  const paydayNext = calendar.find((c) => c.isPayday);
  const advanceNext = calendar.find((c) => c.isAdvance);
  const weekendAvg = mean([dow[5].factor, dow[6].factor]);
  const weekAvg = mean([dow[1].factor, dow[2].factor]);

  // ---- Insights
  const insights: DemandOverview["insights"] = [];
  if (!hasHistory) {
    insights.push({
      tone: "info",
      title: "Central em modo de calibragem",
      text: "Ainda há pouco histórico de consumo. O calendário de feriados, pagamentos e datas comemorativas já está ativo com estimativas do segmento — e cada lançamento diário deixa a projeção mais próxima da sua realidade.",
    });
  }
  for (const pk of peaks.slice(0, 3)) {
    insights.push({
      tone: pk.mult >= 1.6 || (pk.ruptures > 0 && pk.daysLeft <= 7) ? "bad" : "warn",
      title: `${pk.title} — ${pk.label} (${pk.daysLeft === 0 ? "hoje" : pk.daysLeft === 1 ? "amanhã" : `em ${pk.daysLeft} dias`})`,
      text: `Demanda projetada ${Math.round((pk.mult - 1) * 100)}% acima do normal (${fmtShort(pk.date)}).${pk.ruptures > 0 ? ` ${pk.ruptures} item(ns) zeram até lá sem compra.` : " Estoque atual cobre o pico."}`,
    });
  }
  if (missingDays.length >= 3) {
    insights.push({
      tone: "warn",
      title: `${missingDays.length} dias recentes sem lançamentos`,
      text: `Últimos dias sem baixa de consumo: ${missingDays.slice(0, 5).map(fmtShort).join(", ")}. Como a casa abre todo dia, lançar as saídas mantém a previsão fiel.`,
    });
  } else if (lancamentoAtrasado) {
    insights.push({
      tone: "warn",
      title: `Último lançamento há ${daysSinceLast} dias`,
      text: `Vocês costumam lançar a cada ~${consumption.quality.avgPeriodDays.toFixed(1)} dias. Registrar o consumo do período mantém o saldo e a projeção alinhados com a realidade.`,
    });
  }
  if (consumption.quality.spreadApplied) {
    insights.push({
      tone: "info",
      title: `Consumo medido por período (a cada ~${consumption.quality.avgPeriodDays.toFixed(1)} dias)`,
      text: `${recordingDays} lançamento(s) cobrindo ${observedDays} dias. Cada baixa é distribuída pelos dias do período, com peso maior em sexta e sábado — a média diária fica fiel mesmo sem registro dia a dia.`,
    });
  }
  if (consumption.anchor.enabled && consumption.anchor.counts > 0) {
    const f = consumption.anchor.factor;
    insights.push({
      tone: f > 1.05 ? "warn" : "good",
      title: f > 1.05 ? `Inventário revelou ${Math.round((f - 1) * 100)}% de consumo não lançado` : "Inventário confirma o consumo lançado",
      text: f > 1.05
        ? `As contagens apontaram ${brl(consumption.anchor.missingValue)} a menos que o sistema. A projeção e a lista de compras já sobem ${Math.round((f - 1) * 100)}% para refletir o consumo real.`
        : `${consumption.anchor.counts} contagem(ns) conferem com o registrado. A base de projeção está ancorada no estoque real.`,
    });
  } else if (consumption.anchor.enabled) {
    insights.push({
      tone: "info",
      title: "Faça o inventário completo para ancorar a previsão",
      text: "Com a contagem inicial, o sistema passa a comparar consumo lançado × consumo real e corrige sozinho o que escapar do registro.",
    });
  }
  if (cycle.nextDate) {
    const dn = diffDaysIso(todayIso, cycle.nextDate);
    insights.push({
      tone: dn <= 1 ? "warn" : "info",
      title: `Próxima compra ${dn === 0 ? "é hoje" : dn === 1 ? "é amanhã" : `em ${dn} dias`} (${DOW_NAMES[weekdayIso(cycle.nextDate)]})`,
      text: `Ciclo ${cycle.source === "configurado" ? "configurado" : cycle.source === "historico" ? "identificado pelo histórico" : "padrão"}: ${cycle.days.map((d) => DOW_NAMES[d]).join(" e ")}. O pedido precisa cobrir ${Math.max(targetDays, cycleCoverDays)} dias, até a reposição seguinte.`,
    });
  }
  if (cycle.emergencyRate >= 0.25 && consumption.purchases.total >= 6) {
    insights.push({
      tone: "warn",
      title: `${Math.round(cycle.emergencyRate * 100)}% das compras são emergenciais`,
      text: "Compras fora do dia programado custam mais caro e indicam mínimo baixo. Use a lista sugerida no dia do ciclo para reduzir corridas ao mercado.",
    });
  }
  const owedItems = [...consumption.loans.values()].filter((l) => l.owedOut > 0).length;
  if (owedItems > 0) {
    insights.push({
      tone: "warn",
      title: `${owedItems} item(ns) no estoque são de empréstimo`,
      text: "Esse saldo precisa voltar ao parceiro e por isso não conta como disponível na projeção nem na lista de compras.",
    });
  }
  if (paydayNext && paydayNext.date && diffDaysIso(todayIso, paydayNext.date) <= 5) {
    insights.push({
      tone: "info",
      title: `Salário cai em ${fmtShort(paydayNext.date)} (5º dia útil)`,
      text: `Movimento costuma subir ~${Math.round((payFactor - 1) * 100)}% por 3 dias após o pagamento. Verifique itens de giro antes do fim de semana seguinte.`,
    });
  }
  if (weekendAvg > 1.2 && weekAvg < 0.95) {
    insights.push({
      tone: "info",
      title: `Fim de semana vende ${Math.round((weekendAvg / weekAvg - 1) * 100)}% mais que o início da semana`,
      text: "Programe reforço de perecíveis para quinta/sexta e reduza perdas de segunda a quarta.",
    });
  }
  if (trendPctMonth !== null && Math.abs(trendPctMonth) >= 8) {
    insights.push({
      tone: trendPctMonth > 0 ? "good" : "warn",
      title: `Tendência de ${trendPctMonth > 0 ? "alta" : "queda"}: ${trendPctMonth > 0 ? "+" : ""}${trendPctMonth.toFixed(1)}% ao mês`,
      text: trendPctMonth > 0 ? "Demanda crescendo — revise mínimos e metas de cobertura para cima." : "Demanda desacelerando — evite superestoque de perecíveis.",
    });
  }
  const learned = [...fams.values()].filter((f) => f.ratios.length > 0).sort((a, b) => b.ratios.length - a.ratios.length)[0];
  if (learned) {
    insights.push({
      tone: "good",
      title: `Aprendizado ativo: ${learned.title}`,
      text: `Observado ${learned.ratios.length}x no histórico (média ×${mean(learned.ratios).toFixed(2)} vs palpite ×${learned.prior.toFixed(2)}). A cada ocorrência, o peso se ajusta à sua casa.`,
    });
  }
  if (score < 40 && hasHistory) {
    insights.push({
      tone: "info",
      title: "Base em formação — margens de segurança maiores",
      text: `Com ${observedDays} dias de histórico, a lista de compras usa margem extra. Aos 90 dias a confiança sobe para o nível sólido.`,
    });
  }

  const eventLearning = [...fams.entries()]
    .map(([key, f]) => ({
      key,
      title: f.title,
      learned: shrink(mean(f.ratios), f.prior, f.ratios.length, 2),
      prior: f.prior,
      samples: f.ratios.length,
      lastSeen: f.dates.length ? f.dates[f.dates.length - 1] : null,
      nextDate: nextOf(key),
    }))
    .sort((a, b) => b.samples - a.samples);
  // famílias futuras ainda sem observação também aparecem (com palpite)
  for (const c of calendar) {
    for (const e of c.events) {
      if (!eventLearning.some((x) => x.key === e.key)) {
        eventLearning.push({ key: e.key, title: e.title, learned: e.mult, prior: e.mult, samples: 0, lastSeen: null, nextDate: nextOf(e.key) ?? c.date });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    today: todayIso,
    horizon,
    targetDays,
    hasHistory,
    learning: {
      level,
      levelLabel,
      score,
      historyDays: spanDays,
      observedDays,
      coverage,
      firstDate,
      movements,
      weeksObserved: Math.floor(observedDays / 7),
      paydayCycles,
      eventsObserved: famObserved,
      daysSinceLast,
      missingDays,
    },
    factors: {
      dow: dow.map((d, i) => ({ dow: i, name: DOW_NAMES[i], factor: d.factor, prior: d.prior, samples: d.samples })),
      monthly: monthly.map((d, i) => ({ month: i + 1, name: MONTH_NAMES[i], factor: d.factor, prior: d.prior, samples: d.samples })),
      payday: { factor: payFactor, prior: 1.12, samples: payDays.length },
      advance: { factor: advFactor, prior: 1.07, samples: advDays.length },
      trendPctMonth,
      baseDaily: baseAt(todayIso),
    },
    eventLearning,
    calendar,
    peaks,
    summary: {
      avgIndex7: avgIdx(next7),
      avgIndex14: avgIdx(next14),
      projectedValue: calendar.reduce((a, c) => a + c.value, 0),
      nextPeak: nextPeakDay
        ? {
            date: nextPeakDay.date,
            label: `${fmtShort(nextPeakDay.date)} · ${nextPeakDay.weekdayName}`,
            title: nextPeakDay.events.sort((a, b) => b.mult - a.mult)[0]?.title ?? "Pico de fim de semana",
            mult: nextPeakDay.index,
            daysLeft: diffDaysIso(todayIso, nextPeakDay.date),
          }
        : null,
      paydayNext: paydayNext ? { date: paydayNext.date, label: `${fmtShort(paydayNext.date)} · ${paydayNext.weekdayName}`, daysLeft: diffDaysIso(todayIso, paydayNext.date) } : null,
      advanceNext: advanceNext ? { date: advanceNext.date, label: `${fmtShort(advanceNext.date)} · ${advanceNext.weekdayName}`, daysLeft: diffDaysIso(todayIso, advanceNext.date) } : null,
      weekendBoost: weekAvg > 0 ? weekendAvg / weekAvg : 1,
    },
    consumption: {
      mode: consumption.quality.mode,
      modeLabel: consumption.quality.modeLabel,
      recordingDays,
      coverage: consumption.quality.coverage,
      avgPeriodDays: consumption.quality.avgPeriodDays,
      maxGapDays: consumption.quality.maxGapDays,
      spreadApplied: consumption.quality.spreadApplied,
      anchorEnabled: consumption.anchor.enabled,
      anchorCounts: consumption.anchor.counts,
      lastCountDate: consumption.anchor.lastCountDate,
      anchorFactor: consumption.anchor.factor,
      missingValue: consumption.anchor.missingValue,
      surplusValue: consumption.anchor.surplusValue,
      itemsAdjusted: consumption.anchor.itemFactor.size,
    },
    purchase: {
      days: cycle.days,
      dayNames: cycle.days.map((d) => DOW_NAMES[d]),
      source: cycle.source,
      nextDate: cycle.nextDate,
      followingDate: cycle.followingDate,
      daysToNext: cycle.nextDate ? diffDaysIso(todayIso, cycle.nextDate) : null,
      coverDays: Math.max(targetDays, cycleCoverDays),
      emergencyRate: cycle.emergencyRate,
      totalBuys: consumption.purchases.total,
      byDow: consumption.purchases.byDow,
    },
    loans: {
      owedOutItems: [...consumption.loans.values()].filter((l) => l.owedOut > 0).length,
      owedInItems: [...consumption.loans.values()].filter((l) => l.owedIn > 0).length,
    },
    shopping,
    shoppingTotal: shopping.reduce((a, sh) => a + sh.suggestionValue, 0),
    criticalCount: shopping.filter((sh) => sh.urgency === "critical").length,
    insights,
  };
}

/** Versão enxuta para alertas e dashboard (reaproveita o motor). */
export async function getDemandSignals(alertDays: number) {
  // cobertura automática (ciclo de compra) para bater com a tela da Central
  const o = await getDemandOverview(Math.max(alertDays, 7), null);
  return o;
}
