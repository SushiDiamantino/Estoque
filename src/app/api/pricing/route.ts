import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { supplierKey } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";

/**
 * Últimos preços por item, com desvio contra o histórico e sugestão de fornecedor.
 * Normalização de fornecedor é feita em JS (independe de extensão no banco).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let threshold = Number(searchParams.get("threshold") ?? 0.1);
  if (!Number.isFinite(threshold) || threshold < 0.02 || threshold > 1) threshold = 0.1;

  const res = await db.execute(sql`
    with rec as (
      select mi.item_id, m.supplier, mi.unit_cost::numeric as cost,
        (m.movement_date at time zone 'America/Sao_Paulo')::date as d,
        row_number() over (partition by mi.item_id order by m.movement_date desc, m.created_at desc) as rn,
        count(*) over (partition by mi.item_id) as compras
      from movement_items mi
      join movements m on m.id = mi.movement_id
      where m.type = 'entrada' and m.status = 'confirmada' and m.loan_id is null
        and coalesce(m.reason, '') <> 'Ajuste de inventário' and mi.unit_cost::numeric > 0
        and m.movement_date >= now() - interval '400 days'
    )
    select r.item_id, i.name, i.sku, i.unit, r.cost, r.supplier, r.d, r.compras,
      (select round(avg(c.cost)::numeric, 2) from rec c where c.item_id = r.item_id and c.rn > 1) as usual,
      (select min(c.cost)::numeric from rec c where c.item_id = r.item_id) as best_cost,
      (select c.supplier from rec c where c.item_id = r.item_id order by c.cost asc, c.d desc limit 1) as best_supplier
    from rec r
    join items i on i.id = r.item_id
    where r.rn = 1
    order by i.name asc
    limit 400
  `);

  const raw = (res.rows as Record<string, unknown>[]).map((r) => ({
    itemId: String(r.item_id),
    item: String(r.name),
    sku: String(r.sku),
    unit: String(r.unit),
    cost: Number(r.cost ?? 0),
    supplier: String(r.supplier ?? "-"),
    date: String(r.d),
    usualRaw: r.usual === null || r.usual === undefined ? null : Number(r.usual),
    compras: Number(r.compras ?? 0),
    best: r.best_cost === null || r.best_cost === undefined ? null : Number(r.best_cost),
    bestSupplier: (r.best_supplier as string) ?? null,
  }));

  // agrupa o "melhor fornecedor" por chave normalizada (mesma empresa, escritas diferentes)
  const bestByKey = new Map<string, string>();
  for (const r of raw) if (r.bestSupplier) bestByKey.set(supplierKey(r.bestSupplier), r.bestSupplier);

  const rows = raw.map((r) => {
    const deltaPct = r.usualRaw && r.usualRaw > 0 ? (r.cost - r.usualRaw) / r.usualRaw : null;
    const savings = r.best !== null && r.best < r.cost ? Math.round((r.cost - r.best) * 100) / 100 : 0;
    return {
      itemId: r.itemId,
      item: r.item,
      sku: r.sku,
      unit: r.unit,
      cost: r.cost,
      supplier: r.supplier,
      date: r.date,
      usual: r.usualRaw,
      deltaPct,
      compras: r.compras,
      best: r.best,
      bestSupplier: r.bestSupplier ? bestByKey.get(supplierKey(r.bestSupplier)) ?? r.bestSupplier : null,
      savings,
      // comparável só com 2+ compras: menor preço vs melhor preço registrado
      expensive: r.usualRaw !== null && r.usualRaw > 0 && deltaPct !== null && deltaPct >= threshold,
    };
  });

  const withHistory = rows.filter((r) => r.compras >= 2);
  const expensive = withHistory.filter((r) => r.expensive);
  const s = await getSettings();
  const sorted = [...rows].sort((a, b) => {
    const av = a.deltaPct === null ? -1 : a.deltaPct;
    const bv = b.deltaPct === null ? -1 : b.deltaPct;
    return bv - av;
  });

  return NextResponse.json({
    rows: sorted,
    threshold,
    stats: {
      items: rows.length,
      withHistory: withHistory.length,
      expensive: expensive.length,
      savingsTotal: Math.round(expensive.reduce((a, r) => a + r.savings, 0) * 100) / 100,
      priceNotify: s.priceNotify ?? true,
    },
  });
}
