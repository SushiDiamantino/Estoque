import { db } from "@/db";
import { sql } from "drizzle-orm";

export type LotExposure = {
  entryId: string;
  itemId: string;
  item: string;
  unit: string;
  lot: string | null;
  code: string;
  expiry: string;
  days: number;
  qty: number;
  inStock: number;
  cost: number;
  value: number;
  location: string | null;
};

type Row = {
  entry_id: string;
  item_id: string;
  item: string;
  unit: string;
  lot: string | null;
  code: string;
  expiry: string;
  days: number;
  qty: string;
  cost: string;
  location: string | null;
  stock: string;
};

/**
 * Exposição por lote com consumo FIFO: o saldo atual de cada item é atribuído aos
 * lotes recebidos mais recentemente; lotes antigos já consumidos saem da conta.
 * Evita contar o mesmo saldo em vários lotes (e falsos "vencidos").
 */
export async function lotExposure(opts: { locationId?: string | null; categoryId?: string | null } = {}): Promise<LotExposure[]> {
  const loc = opts.locationId ?? null;
  const cat = opts.categoryId ?? null;
  const res = await db.execute(sql`
    select mi.id as entry_id, mi.item_id, i.name as item, i.unit, mi.lot_code as lot, m.code,
      to_char(mi.expiry_date, 'YYYY-MM-DD') as expiry, (mi.expiry_date - current_date)::int as days,
      mi.quantity::numeric as qty,
      coalesce(nullif(mi.unit_cost::numeric, 0), i.cost_price::numeric, 0) as cost,
      loc.name as location,
      coalesce((select sum(sb.quantity::numeric) from stock_balances sb where sb.item_id = i.id ${loc ? sql`and sb.location_id = ${loc}::uuid` : sql``}), 0) as stock
    from movement_items mi
    join movements m on m.id = mi.movement_id
    join items i on i.id = mi.item_id
    left join storage_locations loc on loc.id = m.dest_location_id
    where m.type = 'entrada' and m.status = 'confirmada' and mi.expiry_date is not null and i.active = true
      ${loc ? sql`and m.dest_location_id = ${loc}::uuid` : sql``}
      ${cat ? sql`and i.category_id = ${cat}::uuid` : sql``}
    order by mi.item_id, m.movement_date desc, m.created_at desc, mi.created_at desc
    limit 5000
  `);

  const out: LotExposure[] = [];
  let current = "";
  let remaining = 0;
  for (const r of res.rows as Row[]) {
    if (r.item_id !== current) {
      current = r.item_id;
      remaining = Math.max(0, Number(r.stock));
    }
    const qty = Number(r.qty);
    const inStock = Math.min(qty, remaining);
    remaining = Math.max(0, remaining - inStock);
    if (inStock > 0.0005) {
      const cost = Number(r.cost);
      out.push({
        entryId: r.entry_id,
        itemId: r.item_id,
        item: r.item,
        unit: r.unit,
        lot: r.lot,
        code: r.code,
        expiry: r.expiry,
        days: Number(r.days),
        qty,
        inStock: Math.round(inStock * 1000) / 1000,
        cost,
        value: inStock * cost,
        location: r.location,
      });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}
