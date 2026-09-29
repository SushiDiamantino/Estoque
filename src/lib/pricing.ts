import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * Ciclo de custo por fornecedor.
 *
 * Preços vêm dos recebimentos reais (entradas confirmadas com nota). Fornecedores
 * são agrupados por chave normalizada, porque a mesma empresa entra como
 * "Peixaria Central Ltda", "PEIXARIA CENTRAL" ou "Peixaria Central ME".
 */

/** Chave de agrupamento de fornecedor: minúscula, sem acento, sem sufixos societários. */
/** Chave de agrupamento calculada no banco (mesma regra, sem extensão). */
export function supplierKeySql(column: string) {
  return sql`(
    select string_agg(w, ' ' order by ord) from (
      select w, ord from (
        select word as w, ord,
          not (word in ('ltda','me','eireli','epp','sa','comercio','comercial','distribuidora','atacados','atacado','importadora','empresarial')) as keep,
          row_number() over () as ord
        from unnest(string_to_array(regexp_replace(lower(coalesce(${column}, 'sem fornecedor')), '[^a-zA-Z0-9 ]+', ' ', 'g'), ' ')) with ordinality as t(word, ord)
      ) x where keep
    ) y
  )`;
}

export function supplierKey(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(ltda|ltda\.|me|me\.|eireli|epp|s\/a|sa|comercio|comercial|distribuidora|atacad[oã]os?|importadora|empresarial)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 60);
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (n: number) => Math.round(n * 100) / 100;

/** Expressão SQL que calcula a chave de agrupamento de fornecedor no banco. */
export type PricePoint = {
  supplier: string;
  supplierKey: string;
  unitCost: number;
  quantity: number;
  priceDate: string;
  invoice: string | null;
  movementCode: string;
  movementId: string;
};

export type ItemPriceStats = {
  itemId: string;
  last: PricePoint | null;
  lastFromUsual: PricePoint | null;
  min: PricePoint | null;
  max: PricePoint | null;
  avg: number;
  avgUsual: number | null;
  count: number;
  suppliers: { key: string; name: string; avg: number; count: number; last: number; lastDate: string }[];
  /** variação do último recebimento contra a média do fornecedor habitual (0,12 = +12%) */
  deltaVsUsual: number | null;
  /** quanto o último recebimento ficou acima do melhor fornecedor */
  deltaVsBest: number | null;
  bestSupplier: { key: string; name: string; avg: number } | null;
  savingsVsBest: number;
};

type Row = Record<string, string | number | null>;

/** Histórico de preços por item a partir dos recebimentos com nota. */
export async function itemPriceHistory(itemId: string, limit = 40): Promise<PricePoint[]> {
  const res = await db.execute(sql`
    select m.supplier, m.id as movement_id, m.code as movement_code,
      to_char((m.movement_date at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as price_date,
      m.invoice_number as invoice,
      mi.quantity::numeric as quantity, mi.unit_cost::numeric as unit_cost
    from movement_items mi
    join movements m on m.id = mi.movement_id
    where m.type = 'entrada' and m.status = 'confirmada' and m.loan_id is null
      and coalesce(m.reason, '') <> 'Ajuste de inventário'
      and mi.item_id = ${itemId}::uuid and mi.unit_cost::numeric > 0
    order by m.movement_date desc, m.created_at desc
    limit ${limit}
  `);
  return (res.rows as Row[]).map((r) => ({
    supplier: String(r.supplier ?? "Sem fornecedor"),
    supplierKey: supplierKey(String(r.supplier ?? "")),
    unitCost: num(r.unit_cost),
    quantity: num(r.quantity),
    priceDate: String(r.price_date),
    invoice: (r.invoice as string) ?? null,
    movementCode: String(r.movement_code ?? ""),
    movementId: String(r.movement_id),
  }));
}

/**
 * Estatística de preço de um item: último preço, habitual, melhor fornecedor e
 * desvios. "Habitual" = fornecedor com mais compras nos últimos 6 meses.
 */
export async function itemPriceStats(itemId: string, days = 180): Promise<ItemPriceStats | null> {
  const res = await db.execute(sql`
    select m.supplier, m.id as movement_id, m.code as movement_code,
      to_char((m.movement_date at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as price_date,
      mi.quantity::numeric as quantity, mi.unit_cost::numeric as unit_cost
    from movement_items mi
    join movements m on m.id = mi.movement_id
    where m.type = 'entrada' and m.status = 'confirmada' and m.loan_id is null
      and coalesce(m.reason, '') <> 'Ajuste de inventário'
      and mi.item_id = ${itemId}::uuid and mi.unit_cost::numeric > 0
      and m.movement_date >= now() - (${days}::int * interval '1 day')
    order by m.movement_date desc, m.created_at desc
  `);
  const rows = (res.rows as Row[]).map((r) => ({
    supplier: String(r.supplier ?? "Sem fornecedor"),
    supplierKey: supplierKey(String(r.supplier ?? "")),
    unitCost: num(r.unit_cost),
    quantity: num(r.quantity),
    priceDate: String(r.price_date),
    invoice: null as string | null,
    movementCode: String(r.movement_code ?? ""),
    movementId: String(r.movement_id),
  }));
  if (rows.length === 0) return null;

  const bySupplier = new Map<string, { name: string; total: number; qty: number; count: number; last: number; lastDate: string }>();
  for (const r of rows) {
    const cur = bySupplier.get(r.supplierKey) ?? { name: r.supplier, total: 0, qty: 0, count: 0, last: 0, lastDate: "" };
    cur.total += r.unitCost * Math.max(r.quantity, 0.0001);
    cur.qty += Math.max(r.quantity, 0.0001);
    cur.count++;
    if (!cur.lastDate || r.priceDate > cur.lastDate) {
      cur.last = r.unitCost;
      cur.lastDate = r.priceDate;
    }
    bySupplier.set(r.supplierKey, cur);
  }
  const suppliers = [...bySupplier.entries()]
    .map(([key, v]) => ({ key, name: v.name, avg: money(v.total / v.qty), count: v.count, last: v.last, lastDate: v.lastDate }))
    .sort((a, b) => b.count - a.count || a.avg - b.avg);

  const last = rows[0];
  const usual = suppliers[0];
  const best = [...suppliers].sort((a, b) => a.avg - b.avg)[0];
  const lastFromUsual = rows.find((r) => r.supplierKey === usual.key) ?? null;
  const totalQty = rows.reduce((a, r) => a + Math.max(r.quantity, 0.0001), 0);
  const avg = money(rows.reduce((a, r) => a + r.unitCost * Math.max(r.quantity, 0.0001), 0) / totalQty);

  const deltaVsUsual = usual ? (last.unitCost - usual.avg) / usual.avg : null;
  const deltaVsBest = best && last.supplierKey !== best.key ? (last.unitCost - best.avg) / best.avg : null;
  const savingsVsBest = best && last.supplierKey !== best.key ? money(last.unitCost - best.avg) : 0;

  return {
    itemId,
    last,
    lastFromUsual,
    min: rows.reduce((a, r) => (!a || r.unitCost < a.unitCost ? r : a), null as PricePoint | null),
    max: rows.reduce((a, r) => (!a || r.unitCost > a.unitCost ? r : a), null as PricePoint | null),
    avg,
    avgUsual: usual?.avg ?? null,
    count: rows.length,
    suppliers,
    deltaVsUsual,
    deltaVsBest,
    bestSupplier: best ? { key: best.key, name: best.name, avg: best.avg } : null,
    savingsVsBest,
  };
}

export type PriceAlert = {
  itemId: string;
  item: string;
  sku: string;
  unit: string;
  supplier: string;
  lastCost: number;
  usualCost: number;
  delta: number;
  deltaPct: number;
  bestSupplier: string | null;
  bestCost: number | null;
  savings: number;
  date: string;
};

/**
 * Itens que ficaram mais caros no último recebimento.
 * Só sinaliza variação relevante (>= threshold) e com histórico suficiente.
 */
export async function priceIncreaseAlerts(threshold = 0.1, limit = 25): Promise<PriceAlert[]> {
  const res = await db.execute(sql`
    with rec as (
      select mi.item_id, m.supplier, mi.unit_cost::numeric as cost,
        (m.movement_date at time zone 'America/Sao_Paulo')::date as d,
        row_number() over (partition by mi.item_id order by m.movement_date desc, m.created_at desc) as rn,
        count(*) over (partition by mi.item_id) as total
      from movement_items mi
      join movements m on m.id = mi.movement_id
      where m.type = 'entrada' and m.status = 'confirmada' and m.loan_id is null
        and coalesce(m.reason, '') <> 'Ajuste de inventário' and mi.unit_cost::numeric > 0
        and m.movement_date >= now() - interval '400 days'
    ),
    last as (select item_id, supplier, cost, d from rec where rn = 1 and total >= 2),
    hist as (
      select r.item_id, split_part(lower(coalesce(r.supplier, '')), ' ', 1) as k,
        sum(r.cost * greatest(r2.q, 0.0001)) / sum(greatest(r2.q, 0.0001)) as avg
      from rec r
      join (select item_id, max(d) as maxd from rec group by item_id) lt on lt.item_id = r.item_id
      cross join lateral (select r.cost as q) r2
      where r.rn > 1 and r.d >= lt.maxd - interval '180 days'
      group by r.item_id, k
    )
    select i.id as item_id, i.name, i.sku, i.unit,
      l.supplier, l.cost, l.d,
      h.avg as usual
    from last l
    join items i on i.id = l.item_id
    join hist h on h.item_id = l.item_id
    where h.avg > 0 and l.cost >= h.avg * ${threshold + 1}::numeric
    order by (l.cost / nullif(h.avg, 0)) desc
    limit ${limit}
  `);
  return (res.rows as Row[]).map((r) => {
    const cost = num(r.cost);
    const usual = num(r.usual);
    return {
      itemId: String(r.item_id),
      item: String(r.name),
      sku: String(r.sku),
      unit: String(r.unit),
      supplier: String(r.supplier ?? "-"),
      lastCost: cost,
      usualCost: money(usual),
      delta: money(cost - usual),
      deltaPct: usual > 0 ? (cost - usual) / usual : 0,
      bestSupplier: null,
      bestCost: null,
      savings: 0,
      date: String(r.d),
    };
  });
}

export type SupplierRanking = {
  key: string;
  name: string;
  purchases: number;
  items: number;
  totalValue: number;
  avgTicket: number;
  share: number;
  lastDate: string;
  /** índice de preço: 1,00 = média do sistema; 0,94 = 6% mais barato */
  priceIndex: number | null;
  cheaperCount: number;
  dearerCount: number;
  programada: number;
  emergencial: number;
  emergencyRate: number;
};

/** Ranking de fornecedores: volume, share e índice de preço relativo à média do sistema. */
export async function supplierRanking(days = 180): Promise<{ suppliers: SupplierRanking[]; perItem: Record<string, { suppliers: { key: string; name: string; avg: number; count: number }[] }> }> {
  const res = await db.execute(sql`
    with rec as (
      select m.id, m.supplier, m.total_cost::numeric as total,
        to_char((m.movement_date at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as d,
        (m.reason ilike '%emerg%' or m.notes ilike '%emerg%') as is_emerg,
        mi.item_id, mi.quantity::numeric as qty, mi.unit_cost::numeric as cost
      from movements m
      join movement_items mi on mi.movement_id = m.id
      where m.type = 'entrada' and m.status = 'confirmada' and m.loan_id is null
        and coalesce(m.reason, '') <> 'Ajuste de inventário' and mi.unit_cost::numeric > 0
        and m.movement_date >= now() - (${days}::int * interval '1 day')
    ),
    k0 as (
      select r.id, r.supplier, (select string_agg(word, ' ' order by ord) from (
      select word, ord from unnest(
        string_to_array(regexp_replace(lower(coalesce(r.supplier, 'sem fornecedor')), '[^a-zA-Z0-9 ]+', ' ', 'g'), ' ')
      ) with ordinality as t(word, ord)
    ) w where word not in ('ltda','ltd','me','eireli','epp','sa','comercio','comercial','distribuidora','distribuicao','atacados','atacado','importadora','empresarial','de','da','do','e')) as key from rec r
    ),
    agg as (
      select k0.key as k, max(k0.supplier) as name, count(distinct k0.id)::int as purchases,
        count(distinct rec.item_id)::int as items,
        sum(distinct rec.total)::numeric as total,
        max(rec.d) as last,
        sum(case when rec.is_emerg then 1 else 0 end)::int as emerg
      from rec join k0 on k0.id = rec.id
      group by 1
    ),
    itemavg as (
      select item_id, sum(cost * greatest(qty, 0.0001)) / sum(greatest(qty, 0.0001)) as sys_avg
      from rec group by 1
    ),
    itemprice as (
      select rec.item_id, k0.key as k, max(k0.supplier) as name,
        sum(rec.cost * greatest(rec.qty, 0.0001)) / sum(greatest(rec.qty, 0.0001)) as avg,
        count(*)::int as cnt
      from rec join k0 on k0.id = rec.id
      group by rec.item_id, k0.key
    ),
    rel as (
      select ip.k, sum(ip.avg / nullif(ia.sys_avg, 0) * greatest(ip.cnt, 1)) / sum(greatest(ip.cnt, 1)) as idx,
        sum(case when ip.avg < ia.sys_avg then 1 else 0 end)::int as cheaper,
        sum(case when ip.avg > ia.sys_avg then 1 else 0 end)::int as dearer
      from itemprice ip join itemavg ia on ia.item_id = ip.item_id
      group by ip.k
    )
    select a.k, a.name, a.purchases, a.items, a.total, a.last, a.emerg, r.idx, r.cheaper, r.dearer
    from agg a left join rel r on r.k = a.k
    order by a.total desc nulls last
  `);

  const rows = res.rows as Row[];
  const totalAll = rows.reduce((a, r) => a + num(r.total), 0);
  const suppliers: SupplierRanking[] = rows.map((r) => {
    const purchases = num(r.purchases);
    const emerg = num(r.emerg);
    return {
      key: String(r.k),
      name: String(r.name ?? r.k),
      purchases,
      items: num(r.items),
      totalValue: money(num(r.total)),
      avgTicket: purchases ? money(num(r.total) / purchases) : 0,
      share: totalAll > 0 ? num(r.total) / totalAll : 0,
      lastDate: String(r.last ?? ""),
      priceIndex: r.idx !== null && r.idx !== undefined && Number.isFinite(Number(r.idx)) ? Number(Number(r.idx).toFixed(3)) : null,
      cheaperCount: num(r.cheaper),
      dearerCount: num(r.dearer),
      programada: purchases - emerg,
      emergencial: emerg,
      emergencyRate: purchases > 0 ? emerg / purchases : 0,
    };
  });

  const perItemRes = await db.execute(sql`
    with rec as (
      select m.id, mi.item_id, m.supplier, mi.quantity::numeric as qty, mi.unit_cost::numeric as cost
      from movement_items mi
      join movements m on m.id = mi.movement_id
      where m.type = 'entrada' and m.status = 'confirmada' and m.loan_id is null
        and coalesce(m.reason, '') <> 'Ajuste de inventário' and mi.unit_cost::numeric > 0
        and m.movement_date >= now() - (${days}::int * interval '1 day')
    ),
    k0 as (
      select r.id, r.supplier, (select string_agg(word, ' ' order by ord) from (
      select word, ord from unnest(
        string_to_array(regexp_replace(lower(coalesce(r.supplier, 'sem fornecedor')), '[^a-zA-Z0-9 ]+', ' ', 'g'), ' ')
      ) with ordinality as t(word, ord)
    ) w where word not in ('ltda','ltd','me','eireli','epp','sa','comercio','comercial','distribuidora','distribuicao','atacados','atacado','importadora','empresarial','de','da','do','e')) as key from rec r
    )
    select rec.item_id, k0.key as k, max(k0.supplier) as name,
      sum(rec.cost * greatest(rec.qty, 0.0001)) / sum(greatest(rec.qty, 0.0001)) as avg,
      count(*)::int as cnt
    from rec join k0 on k0.id = rec.id
    group by rec.item_id, k0.key
  `);
  const perItem: Record<string, { suppliers: { key: string; name: string; avg: number; count: number }[] }> = {};
  for (const r of perItemRes.rows as Row[]) {
    const id = String(r.item_id);
    (perItem[id] ??= { suppliers: [] }).suppliers.push({
      key: String(r.k),
      name: String(r.name ?? r.k),
      avg: money(num(r.avg)),
      count: num(r.cnt),
    });
  }
  for (const id of Object.keys(perItem)) perItem[id].suppliers.sort((a, b) => a.avg - b.avg);

  return { suppliers, perItem };
}

/** Últimos preços por item, para preencher o recebimento com o valor de referência. */
export async function lastPricesByItem(): Promise<Record<string, { cost: number; supplier: string; date: string; deltaVsUsual: number | null }>> {
  const res = await db.execute(sql`
    with rec as (
      select mi.item_id, m.supplier, mi.unit_cost::numeric as cost,
        (m.movement_date at time zone 'America/Sao_Paulo')::date as d,
        row_number() over (partition by mi.item_id order by m.movement_date desc, m.created_at desc) as rn,
        count(*) over (partition by mi.item_id) as total
      from movement_items mi
      join movements m on m.id = mi.movement_id
      where m.type = 'entrada' and m.status = 'confirmada' and m.loan_id is null
        and coalesce(m.reason, '') <> 'Ajuste de inventário' and mi.unit_cost::numeric > 0
        and m.movement_date >= now() - interval '400 days'
    ),
    hist as (
      select item_id, sum(cost * 1) / count(*) as avg
      from rec where rn > 1 group by item_id
    )
    select r.item_id, r.cost, r.supplier, r.d, h.avg
    from rec r left join hist h on h.item_id = r.item_id
    where r.rn = 1
  `);
  const out: Record<string, { cost: number; supplier: string; date: string; deltaVsUsual: number | null }> = {};
  for (const r of res.rows as Row[]) {
    const cost = num(r.cost);
    const avg = r.avg === null ? null : num(r.avg);
    out[String(r.item_id)] = {
      cost,
      supplier: String(r.supplier ?? "-"),
      date: String(r.d),
      deltaVsUsual: avg && avg > 0 ? (cost - avg) / avg : null,
    };
  }
  return out;
}
