import { db } from "@/db";
import { sql } from "drizzle-orm";
import { addDaysIso, diffDaysIso, weekdayIso } from "./calendar";

/**
 * Consumo real por período — não por dia.
 *
 * A casa abre todos os dias, mas o lançamento raramente é diário: a cozinha baixa
 * em bloco (após a compra, no fim do turno, a cada 2–3 dias). Tratar cada lançamento
 * como "consumo daquele dia" cria picos falsos e vales de zero.
 *
 * Aqui cada lançamento é distribuído pelos dias do período que ele cobre
 * (do lançamento anterior até ele), ponderado pelo peso do dia da semana. O total
 * é preservado; só a distribuição muda — e a média diária passa a ser fiel.
 *
 * Além disso:
 *  - Ancoragem por inventário: o que a contagem apontou a menos que o sistema é
 *    consumo que aconteceu e não foi lançado. Vira fator de correção por item.
 *  - Empréstimos: o que pegamos e ainda devemos devolver sai do estoque disponível;
 *    o que emprestamos e vamos receber entra como reposição esperada.
 */

const MAX_SPREAD = 31; // além disso, o sistema provavelmente estava fora de uso
const EPS = 1e-9;

export type PeriodMode = "diario" | "misto" | "periodo";

export type ConsumptionQuality = {
  mode: PeriodMode;
  modeLabel: string;
  spanDays: number;
  recordingDays: number;
  coverage: number;
  periods: number;
  avgPeriodDays: number;
  maxGapDays: number;
  spreadApplied: boolean;
  firstDate: string | null;
  lastDate: string | null;
};

export type AnchorInfo = {
  enabled: boolean;
  counts: number;
  lastCountDate: string | null;
  missingValue: number;
  surplusValue: number;
  recordedValue: number;
  factor: number;
  itemFactor: Map<string, number>;
};

export type LoanPosition = { owedOut: number; owedIn: number };

export type ConsumptionData = {
  /** Série diária de VALOR já distribuída pelo período coberto. */
  series: { date: string; value: number }[];
  /** Lançamentos brutos (sem distribuição) — permitem redistribuir com pesos aprendidos. */
  rawValue: { date: string; value: number }[];
  rawItems: Map<string, { date: string; value: number }[]>;
  /** Dias em que houve lançamento (para medir qualidade do registro). */
  recordDates: string[];
  /** Consumo por item: quantidade total e janela real coberta. */
  itemTotals: Map<string, { qty: number; firstDate: string; days: number }>;
  /** Série diária por item (distribuída) — usada na simulação de ruptura. */
  itemDaily: Map<string, Map<string, number>>;
  quality: ConsumptionQuality;
  anchor: AnchorInfo;
  loans: Map<string, LoanPosition>;
  purchases: { dates: string[]; byDow: number[]; total: number };
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Distribui valores lançados em bloco pelos dias do período coberto.
 * `weights` = peso relativo de cada dia da semana (0=Dom).
 */
export function spreadOverPeriods(
  records: { date: string; value: number }[],
  weights: number[],
  until: string
): Map<string, number> {
  const out = new Map<string, number>();
  if (records.length === 0) return out;
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  let prev: string | null = null;
  for (const rec of sorted) {
    const gap = prev ? diffDaysIso(prev, rec.date) : 1;
    const span = Math.max(1, Math.min(gap, MAX_SPREAD));
    const days: string[] = [];
    for (let k = span - 1; k >= 0; k--) days.push(addDaysIso(rec.date, -k));
    const ws = days.map((d) => Math.max(0.05, weights[weekdayIso(d)] ?? 1));
    const tot = ws.reduce((a, b) => a + b, 0) || days.length;
    days.forEach((d, i) => {
      if (d > until) return;
      out.set(d, (out.get(d) ?? 0) + (rec.value * ws[i]) / tot);
    });
    prev = rec.date;
  }
  return out;
}

type ValueRow = { d: string; v: string };
type ItemRow = { item: string; d: string; q: string };
type CountRow = { d: string; item: string; diff: string; cost: string };
type LoanRow = { item: string; direction: string; pending: string };
type BuyRow = { d: string };

export async function loadConsumption(opts: {
  todayIso: string;
  spread: boolean;
  anchor: boolean;
  weights: number[];
}): Promise<ConsumptionData> {
  const { todayIso, spread, anchor, weights } = opts;

  const [valueRes, itemRes, countRes, loanRes, buyRes] = await Promise.all([
    db.execute(sql`
      select to_char((m.movement_date at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as d,
        coalesce(sum(mi.quantity::numeric * coalesce(nullif(mi.unit_cost::numeric, 0), i.cost_price::numeric, 0)), 0) as v
      from movements m
      join movement_items mi on mi.movement_id = m.id
      join items i on i.id = mi.item_id
      where m.status = 'confirmada' and m.type = 'saida' and m.loan_id is null
        and coalesce(m.reason, '') not in ('Perda / quebra', 'Vencimento', 'Avaria', 'Ajuste de inventário')
        and (m.movement_date at time zone 'America/Sao_Paulo')::date <= current_date
        and (m.movement_date at time zone 'America/Sao_Paulo')::date >= current_date - interval '800 days'
      group by 1 order by 1
    `),
    db.execute(sql`
      select mi.item_id as item, to_char((m.movement_date at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as d,
        coalesce(sum(mi.quantity::numeric), 0) as q
      from movements m
      join movement_items mi on mi.movement_id = m.id
      where m.status = 'confirmada' and m.type = 'saida' and m.loan_id is null
        and coalesce(m.reason, '') <> 'Ajuste de inventário'
        and (m.movement_date at time zone 'America/Sao_Paulo')::date <= current_date
        and (m.movement_date at time zone 'America/Sao_Paulo')::date >= current_date - interval '800 days'
      group by 1, 2 order by 2
    `),
    db.execute(sql`
      select to_char((ic.finished_at at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as d,
        ici.item_id as item,
        (ici.counted_qty::numeric - ici.expected_qty::numeric) as diff,
        coalesce(i.cost_price, 0)::numeric as cost
      from inventory_counts ic
      join inventory_count_items ici on ici.count_id = ic.id
      join items i on i.id = ici.item_id
      where ic.status = 'concluido' and ici.counted_qty is not null
        and ic.finished_at >= now() - interval '400 days'
    `),
    db.execute(sql`
      select li.item_id as item, l.direction::text as direction,
        greatest(0, li.quantity::numeric - coalesce((select sum(lri.quantity::numeric) from loan_return_items lri where lri.loan_item_id = li.id), 0)) as pending
      from loans l
      join loan_items li on li.loan_id = l.id
      where l.status in ('aberto', 'parcial')
    `),
    db.execute(sql`
      select to_char((m.movement_date at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as d
      from movements m
      where m.status = 'confirmada' and m.type = 'entrada' and m.loan_id is null
        and coalesce(m.reason, '') <> 'Ajuste de inventário'
        and (m.movement_date at time zone 'America/Sao_Paulo')::date >= current_date - interval '400 days'
      group by 1 order by 1
    `),
  ]);

  const valueRecs = (valueRes.rows as ValueRow[]).map((r) => ({ date: r.d, value: num(r.v) }));
  const recordDates = valueRecs.map((r) => r.date);
  const firstDate = recordDates[0] ?? null;
  const lastDate = recordDates[recordDates.length - 1] ?? null;
  const spanDays = firstDate ? diffDaysIso(firstDate, todayIso) + 1 : 0;
  const coverage = spanDays > 0 ? recordDates.length / spanDays : 0;

  let maxGap = 0;
  const gaps: number[] = [];
  for (let i = 1; i < recordDates.length; i++) {
    const g = diffDaysIso(recordDates[i - 1], recordDates[i]);
    gaps.push(g);
    if (g > maxGap) maxGap = g;
  }
  const avgPeriodDays = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 1;
  const mode: PeriodMode = coverage >= 0.8 ? "diario" : coverage >= 0.35 ? "misto" : "periodo";
  const modeLabel =
    mode === "diario" ? "Lançamento diário" : mode === "misto" ? "Diário com intervalos" : "Lançamento por período";

  // ---- série de valor
  const seriesMap = spread
    ? spreadOverPeriods(valueRecs, weights, todayIso)
    : new Map(valueRecs.map((r) => [r.date, r.value] as const));
  const series = [...seriesMap.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ---- por item
  const perItemRecs = new Map<string, { date: string; value: number }[]>();
  for (const r of itemRes.rows as ItemRow[]) {
    const arr = perItemRecs.get(r.item) ?? [];
    arr.push({ date: r.d, value: num(r.q) });
    perItemRecs.set(r.item, arr);
  }
  const itemDaily = new Map<string, Map<string, number>>();
  const itemTotals = new Map<string, { qty: number; firstDate: string; days: number }>();
  for (const [itemId, recs] of perItemRecs) {
    const m = spread
      ? spreadOverPeriods(recs, weights, todayIso)
      : new Map(recs.map((r) => [r.date, r.value] as const));
    itemDaily.set(itemId, m);
    const dates = [...m.keys()].sort();
    const qty = [...m.values()].reduce((a, b) => a + b, 0);
    const first = dates[0] ?? recs[0].date;
    itemTotals.set(itemId, { qty, firstDate: first, days: Math.max(1, diffDaysIso(first, todayIso) + 1) });
  }

  // ---- ancoragem por inventário
  const itemFactor = new Map<string, number>();
  let missingValue = 0;
  let surplusValue = 0;
  const countDates = new Set<string>();
  const missByItem = new Map<string, number>();
  for (const r of countRes.rows as CountRow[]) {
    const diff = num(r.diff);
    const val = diff * num(r.cost);
    countDates.add(r.d);
    if (diff < 0) {
      missingValue += -val;
      missByItem.set(r.item, (missByItem.get(r.item) ?? 0) + -diff);
    } else if (diff > 0) surplusValue += val;
  }
  const sortedCounts = [...countDates].sort();
  const lastCountDate = sortedCounts[sortedCounts.length - 1] ?? null;
  // Janela de referência: consumo entre a contagem anterior e a última (ou 30 dias antes dela).
  const windowStart = sortedCounts.length >= 2 ? sortedCounts[sortedCounts.length - 2] : lastCountDate ? addDaysIso(lastCountDate, -30) : null;
  const windowValue = windowStart && lastCountDate
    ? series.filter((r) => r.date > windowStart && r.date <= lastCountDate).reduce((a, r) => a + r.value, 0)
    : 0;
  const recordedValue = windowValue > 0 ? windowValue : series.reduce((a, r) => a + r.value, 0);
  let factor = 1;
  if (anchor && recordedValue > 0 && missingValue > 0) {
    factor = Math.min(1.5, 1 + missingValue / recordedValue);
  }
  if (anchor) {
    for (const [itemId, missQty] of missByItem) {
      const m = itemDaily.get(itemId);
      if (!m) continue;
      let ref = 0;
      if (windowStart && lastCountDate) {
        for (const [d, v] of m) if (d > windowStart && d <= lastCountDate) ref += v;
      }
      if (ref <= EPS) ref = itemTotals.get(itemId)?.qty ?? 0;
      if (ref <= EPS) continue;
      itemFactor.set(itemId, Math.min(1.6, 1 + missQty / ref));
    }
  }

  // ---- empréstimos pendentes por item
  const loans = new Map<string, LoanPosition>();
  for (const r of loanRes.rows as LoanRow[]) {
    const pos = loans.get(r.item) ?? { owedOut: 0, owedIn: 0 };
    const pending = num(r.pending);
    if (r.direction === "pegamos") pos.owedOut += pending;
    else pos.owedIn += pending;
    loans.set(r.item, pos);
  }

  // ---- dias de compra
  const buyDates = (buyRes.rows as BuyRow[]).map((r) => r.d);
  const byDow = Array(7).fill(0) as number[];
  for (const d of buyDates) byDow[weekdayIso(d)]++;

  return {
    series,
    rawValue: valueRecs,
    rawItems: perItemRecs,
    recordDates,
    itemTotals,
    itemDaily,
    quality: {
      mode,
      modeLabel,
      spanDays,
      recordingDays: recordDates.length,
      coverage,
      periods: recordDates.length,
      avgPeriodDays,
      maxGapDays: maxGap,
      spreadApplied: spread && mode !== "diario",
      firstDate,
      lastDate,
    },
    anchor: {
      enabled: anchor,
      counts: sortedCounts.length,
      lastCountDate,
      missingValue,
      surplusValue,
      recordedValue,
      factor,
      itemFactor,
    },
    loans,
    purchases: { dates: buyDates, byDow, total: buyDates.length },
  };
}

/** Ciclo de compras: dias configurados ou inferidos do histórico. */
export function purchaseCycle(
  configured: string,
  byDow: number[],
  totalBuys: number,
  todayIso: string
): {
  days: number[];
  source: "configurado" | "historico" | "padrao";
  emergencyRate: number;
  nextDate: string | null;
  followingDate: string | null;
  intervalDays: number;
} {
  let days: number[] = [];
  let source: "configurado" | "historico" | "padrao" = "padrao";
  const parsed = configured
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x !== "")
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  if (parsed.length) {
    days = [...new Set(parsed)].sort();
    source = "configurado";
  } else if (totalBuys >= 6) {
    const ranked = byDow.map((n, dow) => ({ dow, n })).sort((a, b) => b.n - a.n);
    const picked: number[] = [];
    let acc = 0;
    for (const r of ranked) {
      if (r.n === 0) break;
      picked.push(r.dow);
      acc += r.n;
      if (acc / totalBuys >= 0.6 || picked.length >= 3) break;
    }
    if (picked.length) {
      days = picked.sort();
      source = "historico";
    }
  }
  if (!days.length) {
    days = [2, 5]; // terça e sexta: padrão comum em hortifrúti/peixaria
    source = "padrao";
  }
  const inCycle = days.reduce((a, d) => a + (byDow[d] ?? 0), 0);
  const emergencyRate = totalBuys > 0 ? Math.max(0, 1 - inCycle / totalBuys) : 0;

  const nextAfter = (from: string, skipToday: boolean): string | null => {
    for (let i = skipToday ? 1 : 0; i <= 14; i++) {
      const d = addDaysIso(from, i);
      if (days.includes(weekdayIso(d))) return d;
    }
    return null;
  };
  const nextDate = nextAfter(todayIso, false);
  const followingDate = nextDate ? nextAfter(nextDate, true) : null;
  const intervalDays = nextDate && followingDate ? Math.max(1, diffDaysIso(nextDate, followingDate)) : 7;
  return { days, source, emergencyRate, nextDate, followingDate, intervalDays };
}

export const DOW_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
