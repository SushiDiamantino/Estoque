import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getSettings } from "@/lib/settings";
import {
  addDays,
  bucketKey,
  bucketLabel,
  diffDays,
  eachDay,
  fmtDay,
  minDay,
  todayLocal,
  weekdayOf,
  WEEKDAYS,
} from "./dates";
import { forecastDaily } from "./stats";
import { lotExposure } from "@/lib/lots";
import type {
  Bucket,
  Cls,
  Insight,
  ItemMetric,
  ItemStatus,
  Kpis,
  ReportData,
  ReportFiltersInput,
} from "./types";

const PERDAS = ["Perda / quebra", "Vencimento", "Avaria"];
const AJUSTE = "Ajuste de inventário";
const DISCRETE = new Set(["un", "cx", "pct", "saco", "fardo", "pote", "bloco", "peça"]);

type LineRow = {
  mov_id: string;
  code: string;
  type: "entrada" | "saida" | "transferencia";
  reason: string | null;
  supplier: string | null;
  is_loan: boolean;
  d: string;
  dow: number;
  hour: number;
  src_id: string | null;
  dst_id: string | null;
  src_name: string | null;
  dst_name: string | null;
  item_id: string;
  item_name: string;
  sku: string;
  unit: string;
  category_id: string | null;
  qty: string;
  unit_cost: string;
  cost: string;
};

type Line = {
  movId: string;
  code: string;
  type: "entrada" | "saida" | "transferencia";
  reason: string | null;
  supplier: string | null;
  d: string;
  dow: number;
  hour: number;
  srcId: string | null;
  dstId: string | null;
  srcName: string | null;
  dstName: string | null;
  itemId: string;
  itemName: string;
  sku: string;
  unit: string;
  categoryId: string | null;
  qty: number;
  unitCost: number;
  cost: number;
  value: number;
  cls: Cls;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function classify(r: LineRow): Cls {
  if (r.is_loan) return r.type === "entrada" ? "emprestimo_in" : "emprestimo_out";
  if (r.type === "transferencia") return "transferencia";
  if (r.type === "entrada") return r.reason === AJUSTE ? "ajuste_in" : "compra";
  if (r.reason === AJUSTE) return "ajuste_out";
  if (r.reason && PERDAS.includes(r.reason)) return "perda";
  return "consumo";
}

function kpis(lines: Line[], days: number): Kpis {
  const all = new Set<string>();
  const byType = { entrada: new Set<string>(), saida: new Set<string>(), transferencia: new Set<string>() };
  const buys = new Set<string>();
  const consumed = new Set<string>();
  let purchases = 0,
    purchasesQty = 0,
    consumption = 0,
    losses = 0,
    adjustIn = 0,
    adjustOut = 0;
  for (const l of lines) {
    all.add(l.movId);
    byType[l.type].add(l.movId);
    if (l.cls === "compra") {
      purchases += l.value;
      purchasesQty += l.qty;
      buys.add(l.movId);
    } else if (l.cls === "consumo") {
      consumption += l.value;
      consumed.add(l.itemId);
    } else if (l.cls === "perda") losses += l.value;
    else if (l.cls === "ajuste_in") adjustIn += l.value;
    else if (l.cls === "ajuste_out") adjustOut += l.value;
  }
  return {
    purchases,
    purchasesQty,
    purchasesCount: buys.size,
    avgTicket: buys.size ? purchases / buys.size : 0,
    consumption,
    losses,
    lossRate: consumption + losses > 0 ? losses / (consumption + losses) : 0,
    adjustIn,
    adjustOut,
    adjustNet: adjustIn - adjustOut,
    entradasCount: byType.entrada.size,
    saidasCount: byType.saida.size,
    transfersCount: byType.transferencia.size,
    movementsCount: all.size,
    itemsConsumed: consumed.size,
    avgDailyConsumption: days > 0 ? consumption / days : 0,
  };
}

const roundQty = (need: number, unit: string) =>
  DISCRETE.has(unit) ? Math.ceil(need - 1e-9) : Math.ceil(need * 10 - 1e-9) / 10;

const pct = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? 0 : null) : (cur - prev) / prev);
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pctTxt = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export async function buildReport(f: ReportFiltersInput): Promise<ReportData> {
  const today = todayLocal();
  const days = diffDays(f.from, f.to) + 1;
  const prevTo = addDays(f.from, -1);
  const prevFrom = addDays(f.from, -days);
  const bucket: Bucket = f.granularity !== "auto" ? f.granularity : days <= 45 ? "day" : days <= 200 ? "week" : "month";
  const loc = f.locationId;
  const cat = f.categoryId;
  const locMov = loc ? sql`and (m.source_location_id = ${loc}::uuid or m.dest_location_id = ${loc}::uuid)` : sql``;
  const catItem = cat ? sql`and i.category_id = ${cat}::uuid` : sql``;
  const stockLoc = loc ? sql`and sb.location_id = ${loc}::uuid` : sql``;

  const [settings, linesRes, itemsRes, locRes, expRes, invRes, loanRes, optLocs, optCats] = await Promise.all([
    getSettings(),
    db.execute(sql`
      select m.id as mov_id, m.code, m.type, m.reason, m.supplier, (m.loan_id is not null) as is_loan,
        to_char((m.movement_date at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as d,
        extract(dow from m.created_at at time zone 'America/Sao_Paulo')::int as dow,
        extract(hour from m.created_at at time zone 'America/Sao_Paulo')::int as hour,
        m.source_location_id as src_id, m.dest_location_id as dst_id,
        src.name as src_name, dst.name as dst_name,
        mi.item_id, i.name as item_name, i.sku, i.unit, i.category_id,
        mi.quantity::numeric as qty, coalesce(mi.unit_cost, 0)::numeric as unit_cost,
        coalesce(nullif(mi.unit_cost::numeric, 0), i.cost_price::numeric, 0) as cost
      from movements m
      join movement_items mi on mi.movement_id = m.id
      join items i on i.id = mi.item_id
      left join storage_locations src on src.id = m.source_location_id
      left join storage_locations dst on dst.id = m.dest_location_id
      where m.status = 'confirmada'
        and (m.movement_date at time zone 'America/Sao_Paulo')::date between ${prevFrom}::date and ${f.to}::date
        ${locMov} ${catItem}
      order by m.movement_date asc, m.created_at asc
    `),
    db.execute(sql`
      select i.id, i.name, i.sku, i.unit, i.min_stock::numeric as min, coalesce(i.cost_price, 0)::numeric as cost,
        coalesce(i.lead_time_days, 0)::int as lead, i.category_id, c.name as category, c.color,
        coalesce((select sum(sb.quantity::numeric) from stock_balances sb where sb.item_id = i.id ${stockLoc}), 0) as stock
      from items i
      left join categories c on c.id = i.category_id
      where i.active = true ${catItem}
      order by i.name
    `),
    db.execute(sql`
      select l.id, l.name, l.type::text as type,
        coalesce(sum(s.quantity * s.cost), 0) as value,
        coalesce(sum(s.quantity), 0) as qty,
        count(s.item_id) filter (where s.quantity > 0)::int as skus
      from storage_locations l
      left join (
        select sb.location_id, sb.item_id, sb.quantity::numeric as quantity, coalesce(i.cost_price, 0)::numeric as cost
        from stock_balances sb join items i on i.id = sb.item_id
        where i.active = true ${catItem}
      ) s on s.location_id = l.id
      where l.active = true ${loc ? sql`and l.id = ${loc}::uuid` : sql``}
      group by l.id, l.name, l.type
      order by value desc
    `),
    lotExposure({ locationId: loc, categoryId: cat }),
    db.execute(sql`
      select ic.code, coalesce(l.name, 'Geral') as location,
        to_char((ic.finished_at at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as finished,
        count(ici.id) filter (where ici.counted_qty is not null)::int as lines,
        count(ici.id) filter (where ici.counted_qty is not null and ici.counted_qty = ici.expected_qty)::int as exact,
        coalesce(sum(abs(ici.counted_qty - ici.expected_qty) * coalesce(i.cost_price, 0)) filter (where ici.counted_qty is not null), 0) as divergence,
        coalesce(sum((ici.counted_qty - ici.expected_qty) * coalesce(i.cost_price, 0)) filter (where ici.counted_qty is not null), 0) as net
      from inventory_counts ic
      left join storage_locations l on l.id = ic.location_id
      left join inventory_count_items ici on ici.count_id = ic.id
      left join items i on i.id = ici.item_id
      where ic.status = 'concluido'
        and (ic.finished_at at time zone 'America/Sao_Paulo')::date between ${f.from}::date and ${f.to}::date
        ${loc ? sql`and ici.location_id = ${loc}::uuid` : sql``} ${catItem}
      group by ic.id, ic.code, l.name, ic.finished_at
      order by ic.finished_at desc
    `),
    db.execute(sql`
      select l.code, l.direction::text as direction, l.status::text as status, p.name as partner,
        to_char(l.due_date, 'YYYY-MM-DD') as due, (l.due_date - current_date)::int as days_left,
        to_char(l.loan_date, 'YYYY-MM-DD') as loan_date,
        to_char((l.settled_at at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as settled,
        coalesce((select sum(greatest(0, li.quantity::numeric - coalesce((select sum(lri.quantity::numeric) from loan_return_items lri where lri.loan_item_id = li.id), 0)) * li.unit_cost::numeric)
          from loan_items li where li.loan_id = l.id), 0) as outstanding
      from loans l
      join partners p on p.id = l.partner_id
      where l.status <> 'cancelado' ${loc ? sql`and l.location_id = ${loc}::uuid` : sql``}
    `),
    db.execute(sql`select id, name from storage_locations order by name`),
    db.execute(sql`select id, name, color from categories order by name`),
  ]);

  /* ------------------------------------------------------------ linhas */
  const lines: Line[] = (linesRes.rows as LineRow[]).map((r) => {
    const qty = num(r.qty);
    const cost = num(r.cost);
    return {
      movId: r.mov_id,
      code: r.code,
      type: r.type,
      reason: r.reason,
      supplier: r.supplier,
      d: r.d,
      dow: num(r.dow),
      hour: num(r.hour),
      srcId: r.src_id,
      dstId: r.dst_id,
      srcName: r.src_name,
      dstName: r.dst_name,
      itemId: r.item_id,
      itemName: r.item_name,
      sku: r.sku,
      unit: r.unit,
      categoryId: r.category_id,
      qty,
      unitCost: num(r.unit_cost),
      cost,
      value: qty * cost,
      cls: classify(r),
    };
  });
  const cur = lines.filter((l) => l.d >= f.from && l.d <= f.to);
  const prevLines = lines.filter((l) => l.d >= prevFrom && l.d <= prevTo);
  const k = kpis(cur, days);
  const kp = kpis(prevLines, days);
  const isOut = (c: Cls) => c === "consumo" || c === "perda";

  /* ------------------------------------------------------------ série temporal */
  const keys: string[] = [];
  for (const d of eachDay(f.from, f.to)) {
    const key = bucketKey(d, bucket);
    if (keys[keys.length - 1] !== key) keys.push(key);
  }
  const seriesMap = new Map(
    keys.map((key) => [key, { purchases: 0, consumption: 0, losses: 0, e: new Set<string>(), s: new Set<string>(), t: new Set<string>() }])
  );
  for (const l of cur) {
    const b = seriesMap.get(bucketKey(l.d, bucket));
    if (!b) continue;
    if (l.cls === "compra") b.purchases += l.value;
    else if (l.cls === "consumo") b.consumption += l.value;
    else if (l.cls === "perda") b.losses += l.value;
    (l.type === "entrada" ? b.e : l.type === "saida" ? b.s : b.t).add(l.movId);
  }
  const series = keys.map((key) => {
    const b = seriesMap.get(key)!;
    return {
      key,
      label: bucketLabel(key, bucket),
      purchases: b.purchases,
      consumption: b.consumption,
      losses: b.losses,
      entradas: b.e.size,
      saidas: b.s.size,
      transferencias: b.t.size,
    };
  });

  /* ------------------------------------------------------------ itens */
  type Agg = { inQty: number; outQty: number; lossQty: number; outValue: number; prevOut: number; lastMove: string | null; lastOut: string | null; buys: { d: string; cost: number; qty: number }[] };
  const agg = new Map<string, Agg>();
  const getAgg = (id: string) => {
    let a = agg.get(id);
    if (!a) {
      a = { inQty: 0, outQty: 0, lossQty: 0, outValue: 0, prevOut: 0, lastMove: null, lastOut: null, buys: [] };
      agg.set(id, a);
    }
    return a;
  };
  for (const l of cur) {
    const a = getAgg(l.itemId);
    if (!a.lastMove || l.d > a.lastMove) a.lastMove = l.d;
    if (l.cls === "compra") {
      a.inQty += l.qty;
      if (l.unitCost > 0) a.buys.push({ d: l.d, cost: l.unitCost, qty: l.qty });
    }
    if (isOut(l.cls)) {
      a.outQty += l.qty;
      a.outValue += l.value;
      if (!a.lastOut || l.d > a.lastOut) a.lastOut = l.d;
    }
    if (l.cls === "perda") a.lossQty += l.qty;
  }
  for (const l of prevLines) if (isOut(l.cls)) getAgg(l.itemId).prevOut += l.qty;

  type ItemRow = { id: string; name: string; sku: string; unit: string; min: string; cost: string; lead: number; category_id: string | null; category: string | null; color: string | null; stock: string };
  const items: ItemMetric[] = (itemsRes.rows as ItemRow[]).map((r) => {
    const a = agg.get(r.id) ?? { inQty: 0, outQty: 0, lossQty: 0, outValue: 0, prevOut: 0, lastMove: null, lastOut: null, buys: [] };
    const stock = num(r.stock);
    const min = num(r.min);
    const cost = num(r.cost);
    const lead = num(r.lead);
    const avgDaily = a.outQty / days;
    const coverage = avgDaily > 0 ? Math.max(0, stock) / avgDaily : null;
    let price: ItemMetric["price"] = null;
    if (a.buys.length) {
      const q = a.buys.reduce((s, b) => s + b.qty, 0);
      const first = a.buys[0].cost;
      const last = a.buys[a.buys.length - 1].cost;
      price = {
        first,
        last,
        min: Math.min(...a.buys.map((b) => b.cost)),
        max: Math.max(...a.buys.map((b) => b.cost)),
        avg: q > 0 ? a.buys.reduce((s, b) => s + b.cost * b.qty, 0) / q : last,
        variation: a.buys.length > 1 && first > 0 ? (last - first) / first : null,
        buys: a.buys.length,
      };
    }
    let status: ItemStatus = "ok";
    if (stock <= 0 && (min > 0 || a.outQty > 0)) status = "ruptura";
    else if (min > 0 && stock < min) status = "critico";
    else if (coverage !== null && coverage < f.targetDays) status = "atencao";
    else if (stock > 0 && a.outQty === 0) status = "parado";
    else if (stock <= 0 && a.outQty === 0) status = "sem_giro";

    const need = avgDaily > 0 ? avgDaily * (f.targetDays + lead) + min - stock : min - stock;
    const suggestion = need > 0 ? roundQty(need, r.unit) : 0;
    return {
      id: r.id,
      name: r.name,
      sku: r.sku,
      unit: r.unit,
      category: r.category,
      categoryColor: r.color,
      stock,
      stockValue: Math.max(0, stock) * cost,
      min,
      cost,
      leadTime: lead,
      inQty: a.inQty,
      outQty: a.outQty,
      lossQty: a.lossQty,
      outValue: a.outValue,
      prevOutQty: a.prevOut,
      avgDaily,
      coverageDays: coverage,
      ruptureDate: coverage !== null ? addDays(today, Math.floor(coverage)) : null,
      daysToMin: avgDaily > 0 ? Math.max(0, (stock - min) / avgDaily) : null,
      suggestion,
      suggestionValue: suggestion * (price?.last || cost),
      status,
      lastMove: a.lastMove,
      lastOut: a.lastOut,
      price,
    };
  });

  if (loc) {
    for (let i = items.length - 1; i >= 0; i--) if (items[i].stock === 0 && !agg.has(items[i].id)) items.splice(i, 1);
  }
  const stockValue = items.reduce((s, i) => s + i.stockValue, 0);
  const opsOut = k.consumption + k.losses;
  const stagnant = items.filter((i) => i.status === "parado");
  const stock = {
    value: stockValue,
    qty: items.reduce((s, i) => s + Math.max(0, i.stock), 0),
    items: items.length,
    withStock: items.filter((i) => i.stock > 0).length,
    belowMin: items.filter((i) => i.min > 0 && i.stock < i.min).length,
    ruptures: items.filter((i) => i.status === "ruptura").length,
    stagnantValue: stagnant.reduce((s, i) => s + i.stockValue, 0),
    stagnantCount: stagnant.length,
    turnover: stockValue > 0 ? opsOut / stockValue : null,
    turnoverAnnual: stockValue > 0 ? (opsOut / stockValue) * (365 / days) : null,
    dio: opsOut > 0 ? stockValue / (opsOut / days) : null,
  };

  /* ------------------------------------------------------------ Curva ABC */
  const abcMap = new Map<string, { itemId: string; name: string; sku: string; unit: string; qty: number; value: number }>();
  for (const l of cur) {
    if (!isOut(l.cls)) continue;
    const r = abcMap.get(l.itemId) ?? { itemId: l.itemId, name: l.itemName, sku: l.sku, unit: l.unit, qty: 0, value: 0 };
    r.qty += l.qty;
    r.value += l.value;
    abcMap.set(l.itemId, r);
  }
  const abcRows = [...abcMap.values()];
  const byValue = abcRows.reduce((s, r) => s + r.value, 0) > 0;
  const w = (r: { qty: number; value: number }) => (byValue ? r.value : r.qty);
  const abcTotal = abcRows.reduce((s, r) => s + w(r), 0);
  let cum = 0;
  const abc = abcRows
    .sort((a, b) => w(b) - w(a))
    .map((r) => {
      const before = abcTotal > 0 ? cum / abcTotal : 0;
      cum += w(r);
      return {
        ...r,
        share: abcTotal > 0 ? w(r) / abcTotal : 0,
        cumShare: abcTotal > 0 ? cum / abcTotal : 0,
        cls: (before < 0.8 ? "A" : before < 0.95 ? "B" : "C") as "A" | "B" | "C",
      };
    });

  /* ------------------------------------------------------------ categorias */
  type CatRow = { id: string; name: string; color: string | null };
  const catInfo = new Map((optCats.rows as CatRow[]).map((c) => [c.id, c]));
  const catMap = new Map<string, ReportData["categories"][number]>();
  const getCat = (id: string | null) => {
    const key = id ?? "none";
    let c = catMap.get(key);
    if (!c) {
      const info = id ? catInfo.get(id) : undefined;
      c = { id: key, name: info?.name ?? "Sem categoria", color: info?.color ?? "#71717a", purchases: 0, consumption: 0, losses: 0, stockValue: 0, items: 0 };
      catMap.set(key, c);
    }
    return c;
  };
  for (const l of cur) {
    const c = getCat(l.categoryId);
    if (l.cls === "compra") c.purchases += l.value;
    else if (l.cls === "consumo") c.consumption += l.value;
    else if (l.cls === "perda") c.losses += l.value;
  }
  for (const r of itemsRes.rows as ItemRow[]) {
    const c = getCat(r.category_id);
    c.items++;
    c.stockValue += Math.max(0, num(r.stock)) * num(r.cost);
  }
  const categories = [...catMap.values()].sort((a, b) => b.consumption + b.stockValue - (a.consumption + a.stockValue));

  /* ------------------------------------------------------------ locais */
  const inV = new Map<string, number>();
  const outV = new Map<string, number>();
  for (const l of cur) {
    if (l.dstId) inV.set(l.dstId, (inV.get(l.dstId) ?? 0) + l.value);
    if (l.srcId) outV.set(l.srcId, (outV.get(l.srcId) ?? 0) + l.value);
  }
  type LocRow = { id: string; name: string; type: string; value: string; qty: string; skus: number };
  const locations = (locRes.rows as LocRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    stockValue: num(r.value),
    stockQty: num(r.qty),
    skus: num(r.skus),
    inValue: inV.get(r.id) ?? 0,
    outValue: outV.get(r.id) ?? 0,
  }));

  /* ------------------------------------------------------------ fornecedores */
  const supMap = new Map<string, { value: number; movs: Set<string>; items: Set<string>; last: string }>();
  for (const l of cur) {
    if (l.cls !== "compra") continue;
    const name = l.supplier?.trim() || "Sem fornecedor informado";
    const s = supMap.get(name) ?? { value: 0, movs: new Set<string>(), items: new Set<string>(), last: l.d };
    s.value += l.value;
    s.movs.add(l.movId);
    s.items.add(l.itemId);
    if (l.d > s.last) s.last = l.d;
    supMap.set(name, s);
  }
  const suppliers = [...supMap.entries()]
    .map(([name, s]) => ({
      name,
      value: s.value,
      movements: s.movs.size,
      items: s.items.size,
      avgTicket: s.movs.size ? s.value / s.movs.size : 0,
      lastDate: s.last,
      share: k.purchases > 0 ? s.value / k.purchases : 0,
    }))
    .sort((a, b) => b.value - a.value);

  /* ------------------------------------------------------------ perdas */
  const reasonMap = new Map<string, { value: number; qty: number; movs: Set<string> }>();
  const lossItems = new Map<string, { name: string; unit: string; qty: number; value: number; reasons: Map<string, number> }>();
  for (const l of cur) {
    if (l.cls !== "perda") continue;
    const reason = l.reason ?? "Perda";
    const r = reasonMap.get(reason) ?? { value: 0, qty: 0, movs: new Set<string>() };
    r.value += l.value;
    r.qty += l.qty;
    r.movs.add(l.movId);
    reasonMap.set(reason, r);
    const it = lossItems.get(l.itemId) ?? { name: l.itemName, unit: l.unit, qty: 0, value: 0, reasons: new Map<string, number>() };
    it.qty += l.qty;
    it.value += l.value;
    it.reasons.set(reason, (it.reasons.get(reason) ?? 0) + l.value);
    lossItems.set(l.itemId, it);
  }
  const losses = {
    byReason: [...reasonMap.entries()].map(([reason, r]) => ({ reason, value: r.value, qty: r.qty, count: r.movs.size })).sort((a, b) => b.value - a.value),
    topItems: [...lossItems.values()]
      .map((it) => ({ name: it.name, unit: it.unit, qty: it.qty, value: it.value, reason: [...it.reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—" }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 30),
  };

  /* ------------------------------------------------------------ transferências */
  const trMap = new Map<string, { from: string; to: string; movs: Set<string>; qty: number; value: number }>();
  for (const l of cur) {
    if (l.cls !== "transferencia") continue;
    const key = `${l.srcId}|${l.dstId}`;
    const t = trMap.get(key) ?? { from: l.srcName ?? "?", to: l.dstName ?? "?", movs: new Set<string>(), qty: 0, value: 0 };
    t.movs.add(l.movId);
    t.qty += l.qty;
    t.value += l.value;
    trMap.set(key, t);
  }
  const transfers = [...trMap.values()].map((t) => ({ from: t.from, to: t.to, count: t.movs.size, qty: t.qty, value: t.value })).sort((a, b) => b.value - a.value);

  /* ------------------------------------------------------------ dia da semana + mapa de calor */
  const occ = Array(7).fill(0) as number[];
  for (const d of eachDay(f.from, f.to)) occ[weekdayOf(d)]++;
  const wdTotal = Array(7).fill(0) as number[];
  for (const l of cur) if (l.cls === "consumo") wdTotal[weekdayOf(l.d)] += l.value;
  const weekday = [1, 2, 3, 4, 5, 6, 0].map((dow) => ({ dow, label: WEEKDAYS[dow], total: wdTotal[dow], avg: occ[dow] ? wdTotal[dow] / occ[dow] : 0 }));
  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  const seenMov = new Set<string>();
  for (const l of cur) {
    if (seenMov.has(l.movId)) continue;
    seenMov.add(l.movId);
    heatmap[l.dow][l.hour]++;
  }

  /* ------------------------------------------------------------ validade */
  const lots = expRes
    .filter((l) => l.days <= 90)
    .map((l) => ({ item: l.item, unit: l.unit, lot: l.lot, expiry: l.expiry, days: l.days, qty: l.qty, risk: l.inStock, value: l.value, location: l.location }));
  const bucketDefs: { label: string; test: (d: number) => boolean; tone: "bad" | "warn" | "info" }[] = [
    { label: "Vencidos", test: (d) => d < 0, tone: "bad" },
    { label: "0–7 dias", test: (d) => d >= 0 && d <= 7, tone: "bad" },
    { label: "8–15 dias", test: (d) => d >= 8 && d <= 15, tone: "warn" },
    { label: "16–30 dias", test: (d) => d >= 16 && d <= 30, tone: "warn" },
    { label: "31–60 dias", test: (d) => d >= 31 && d <= 60, tone: "info" },
    { label: "61–90 dias", test: (d) => d >= 61 && d <= 90, tone: "info" },
  ];
  const expiry = {
    buckets: bucketDefs.map((b) => {
      const sel = lots.filter((l) => b.test(l.days));
      return { label: b.label, count: sel.length, value: sel.reduce((s, l) => s + l.value, 0), tone: b.tone };
    }),
    lots,
  };

  /* ------------------------------------------------------------ inventário */
  type InvRow = { code: string; location: string; finished: string; lines: number; exact: number; divergence: string; net: string };
  const counts = (invRes.rows as InvRow[]).map((r) => ({
    code: r.code,
    location: r.location,
    finishedAt: r.finished,
    lines: num(r.lines),
    exact: num(r.exact),
    accuracy: num(r.lines) > 0 ? num(r.exact) / num(r.lines) : null,
    divergenceValue: num(r.divergence),
    netValue: num(r.net),
  }));
  const totLines = counts.reduce((s, c) => s + c.lines, 0);
  const inventory = {
    counts,
    accuracy: totLines > 0 ? counts.reduce((s, c) => s + c.exact, 0) / totLines : null,
    divergenceValue: counts.reduce((s, c) => s + c.divergenceValue, 0),
    netValue: counts.reduce((s, c) => s + c.netValue, 0),
  };

  /* ------------------------------------------------------------ empréstimos */
  type LoanRow = { code: string; direction: "pegamos" | "emprestamos"; status: string; partner: string; due: string; days_left: number; loan_date: string; settled: string | null; outstanding: string };
  const loanRows = loanRes.rows as LoanRow[];
  const openLoans = loanRows.filter((l) => l.status === "aberto" || l.status === "parcial");
  const agingDefs = [
    { label: "A vencer", test: (d: number) => d >= 0 },
    { label: "1–7 dias de atraso", test: (d: number) => d < 0 && d >= -7 },
    { label: "8–30 dias de atraso", test: (d: number) => d < -7 && d >= -30 },
    { label: "+30 dias de atraso", test: (d: number) => d < -30 },
  ];
  const partnerMap = new Map<string, { receive: number; ret: number; overdue: number; open: number }>();
  for (const l of openLoans) {
    const p = partnerMap.get(l.partner) ?? { receive: 0, ret: 0, overdue: 0, open: 0 };
    const v = num(l.outstanding);
    if (l.direction === "emprestamos") p.receive += v;
    else p.ret += v;
    if (num(l.days_left) < 0) p.overdue++;
    p.open++;
    partnerMap.set(l.partner, p);
  }
  const settledIn = loanRows.filter((l) => l.settled && l.settled >= f.from && l.settled <= f.to);
  const toReceive = openLoans.filter((l) => l.direction === "emprestamos").reduce((s, l) => s + num(l.outstanding), 0);
  const toReturn = openLoans.filter((l) => l.direction === "pegamos").reduce((s, l) => s + num(l.outstanding), 0);
  const overdueLoans = openLoans.filter((l) => num(l.days_left) < 0);
  const loans = {
    toReceive,
    toReturn,
    net: toReceive - toReturn,
    openCount: openLoans.length,
    overdueCount: overdueLoans.length,
    overdueValue: overdueLoans.reduce((s, l) => s + num(l.outstanding), 0),
    createdInPeriod: loanRows.filter((l) => l.loan_date >= f.from && l.loan_date <= f.to).length,
    settledInPeriod: settledIn.length,
    avgDaysToSettle: settledIn.length ? settledIn.reduce((s, l) => s + Math.max(0, diffDays(l.loan_date, l.settled!)), 0) / settledIn.length : null,
    aging: agingDefs.map((a) => {
      const sel = openLoans.filter((l) => a.test(num(l.days_left)));
      return {
        label: a.label,
        receive: sel.filter((l) => l.direction === "emprestamos").reduce((s, l) => s + num(l.outstanding), 0),
        ret: sel.filter((l) => l.direction === "pegamos").reduce((s, l) => s + num(l.outstanding), 0),
      };
    }),
    byPartner: [...partnerMap.entries()].map(([partner, p]) => ({ partner, ...p })).sort((a, b) => b.receive + b.ret - (a.receive + a.ret)),
    open: openLoans
      .map((l) => ({ code: l.code, partner: l.partner, direction: l.direction, due: l.due, daysLeft: num(l.days_left), value: num(l.outstanding) }))
      .sort((a, b) => a.daysLeft - b.daysLeft),
  };

  /* ------------------------------------------------------------ projeção */
  const histEnd = minDay(f.to, today);
  const dailyMap = new Map<string, number>();
  for (const l of cur) if (l.cls === "consumo") dailyMap.set(l.d, (dailyMap.get(l.d) ?? 0) + l.value);
  const historyDays = histEnd >= f.from ? eachDay(f.from, histEnd) : [];
  const history = historyDays.map((d) => ({ date: d, value: dailyMap.get(d) ?? 0 }));
  const start = addDays(histEnd >= f.from ? histEnd : f.to, 1);
  const fc = forecastDaily(history, f.horizon, start);
  const horizonEnd = addDays(today, f.horizon);
  const forecast = {
    method: fc.method,
    start,
    history: history.map((h, i) => ({ date: h.date, value: h.value, ma7: fc.ma7[i] ?? null })),
    points: fc.points,
    total: fc.total,
    low: fc.low,
    high: fc.high,
    slopePerDay: fc.slopePerDay,
    trendPctMonth: fc.trendPctMonth,
    r2: fc.r2,
    weekdayFactors: fc.factors,
    projectedStockValue: Math.max(0, stockValue - fc.total),
    purchaseNeed: items.reduce((s, i) => s + i.suggestionValue, 0),
    rupturesInHorizon: items.filter((i) => i.status === "ruptura" || (i.ruptureDate !== null && i.ruptureDate <= horizonEnd)).length,
  };

  /* ------------------------------------------------------------ extrato */
  const logMap = new Map<string, ReportData["movementsLog"][number]>();
  for (const l of cur) {
    const m = logMap.get(l.movId) ?? {
      code: l.code,
      type: l.type,
      cls: l.cls,
      date: l.d,
      reason: l.reason,
      supplier: l.supplier,
      from: l.srcName,
      to: l.dstName,
      items: 0,
      qty: 0,
      value: 0,
    };
    m.items++;
    m.qty += l.qty;
    m.value += l.value;
    logMap.set(l.movId, m);
  }
  const movementsLog = [...logMap.values()].sort((a, b) => (a.date === b.date ? b.code.localeCompare(a.code) : b.date.localeCompare(a.date))).slice(0, 1500);

  /* ------------------------------------------------------------ destaques */
  const insights: Insight[] = [];
  const dCons = pct(k.consumption, kp.consumption);
  if (dCons !== null && Math.abs(dCons) >= 0.1 && kp.consumption > 0) {
    insights.push({
      tone: dCons > 0 ? "warn" : "good",
      title: `Consumo ${dCons > 0 ? "subiu" : "caiu"} ${pctTxt(Math.abs(dCons))}`,
      text: `${brl(k.consumption)} no período contra ${brl(kp.consumption)} em ${fmtDay(prevFrom)}–${fmtDay(prevTo)}.`,
    });
  }
  if (k.lossRate >= 0.05) {
    insights.push({ tone: "bad", title: `Taxa de perda em ${pctTxt(k.lossRate)}`, text: `${brl(k.losses)} baixados por perda, vencimento ou avaria. Principal motivo: ${losses.byReason[0]?.reason ?? "—"}.` });
  } else if (k.consumption > 0 && k.losses === 0) {
    insights.push({ tone: "good", title: "Nenhuma perda registrada", text: "Todas as saídas do período foram de consumo operacional." });
  }
  if (stock.ruptures > 0) insights.push({ tone: "bad", title: `${stock.ruptures} item(ns) em ruptura`, text: "Sem saldo e com consumo ou estoque mínimo definido — risco de parar a produção." });
  const soon = items.filter((i) => i.status !== "ruptura" && i.ruptureDate !== null && i.ruptureDate <= addDays(today, 7));
  if (soon.length) insights.push({ tone: "warn", title: `${soon.length} item(ns) acabam em até 7 dias`, text: soon.slice(0, 4).map((i) => `${i.name} (${fmtDay(i.ruptureDate)})`).join(", ") + (soon.length > 4 ? "…" : "") });
  const priceUp = items.filter((i) => i.price?.variation != null && i.price.variation >= 0.1).sort((a, b) => (b.price!.variation! - a.price!.variation!));
  if (priceUp.length) insights.push({ tone: "warn", title: `Custo de ${priceUp[0].name} subiu ${pctTxt(priceUp[0].price!.variation!)}`, text: `De ${brl(priceUp[0].price!.first)} para ${brl(priceUp[0].price!.last)} por ${priceUp[0].unit}.${priceUp.length > 1 ? ` Mais ${priceUp.length - 1} item(ns) com alta ≥ 10%.` : ""}` });
  if (suppliers.length > 1 && suppliers[0].share >= 0.6) insights.push({ tone: "info", title: `Compras concentradas em ${suppliers[0].name}`, text: `${pctTxt(suppliers[0].share)} do valor comprado — avalie um fornecedor alternativo.` });
  const expired = expiry.buckets[0];
  if (expired.count > 0) insights.push({ tone: "bad", title: `${expired.count} lote(s) vencido(s) com saldo`, text: `${brl(expired.value)} em risco. Registre a baixa por vencimento.` });
  if (loans.overdueCount > 0) insights.push({ tone: "bad", title: `${loans.overdueCount} empréstimo(s) vencido(s)`, text: `${brl(loans.overdueValue)} pendentes com parceiros.` });
  if (stockValue > 0 && stock.stagnantValue / stockValue >= 0.15) insights.push({ tone: "warn", title: `${pctTxt(stock.stagnantValue / stockValue)} do estoque está parado`, text: `${stock.stagnantCount} item(ns) sem saída no período somam ${brl(stock.stagnantValue)}.` });
  if (inventory.accuracy !== null && inventory.accuracy < 0.95) insights.push({ tone: "warn", title: `Acurácia de inventário em ${pctTxt(inventory.accuracy)}`, text: `Divergência absoluta de ${brl(inventory.divergenceValue)} nas contagens do período.` });
  if (fc.trendPctMonth !== null && Math.abs(fc.trendPctMonth) >= 10) insights.push({ tone: "info", title: `Tendência de consumo ${fc.trendPctMonth > 0 ? "de alta" : "de queda"}`, text: `${fc.trendPctMonth > 0 ? "+" : ""}${fc.trendPctMonth.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% ao mês pela regressão do período.` });
  if (insights.length === 0) insights.push({ tone: "info", title: "Operação estável", text: "Nenhum desvio relevante identificado para os filtros selecionados." });

  type Opt = { id: string; name: string };
  const optL = optLocs.rows as Opt[];
  return {
    generatedAt: new Date().toISOString(),
    restaurantName: settings.restaurantName,
    today,
    filters: {
      ...f,
      locationName: loc ? optL.find((o) => o.id === loc)?.name ?? null : null,
      categoryName: cat ? catInfo.get(cat)?.name ?? null : null,
      days,
      prevFrom,
      prevTo,
      bucket,
    },
    options: { locations: optL, categories: (optCats.rows as CatRow[]).map((c) => ({ id: c.id, name: c.name })) },
    kpis: k,
    prev: kp,
    stock,
    series,
    abc,
    items,
    categories,
    locations,
    suppliers,
    losses,
    transfers,
    weekday,
    heatmap,
    expiry,
    inventory,
    loans,
    forecast,
    insights,
    movementsLog,
  };
}
