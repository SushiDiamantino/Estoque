import { NextResponse } from "next/server";
import { db } from "@/db";
import { movements, inventoryCounts, storageLocations } from "@/db/schema";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getSettings } from "@/lib/settings";
import { lotExposure } from "@/lib/lots";
import { getDemandOverview } from "@/lib/demand/engine";

export async function GET() {
  const s = await getSettings();

  const [totalsRes, recent, dist, low, byDay, nextInv, lots, demand] = await Promise.all([
    db.execute(sql`
      select
        (select count(*)::int from items where active = true) as items_active,
        (select count(distinct sb.item_id)::int from stock_balances sb join items i on i.id = sb.item_id
           where sb.quantity::numeric > 0 and i.active = true) as items_with_stock,
        (select count(*)::int from storage_locations where active = true) as locations,
        (select coalesce(sum(quantity::numeric), 0) from stock_balances) as total_qty,
        (select count(*)::int from items i
           left join (select item_id, sum(quantity::numeric) as qty from stock_balances group by item_id) b on b.item_id = i.id
           where i.active = true and i.min_stock::numeric > 0 and coalesce(b.qty, 0) < i.min_stock::numeric) as below_min,
        (select count(*)::int from movements where status = 'rascunho') as drafts,
        (select count(*)::int from inventory_counts where status in ('aberto', 'em_contagem')) as open_inventories,
        (select count(*)::int from loans where status in ('aberto','parcial') and direction = 'emprestamos') as loans_to_receive,
        (select count(*)::int from loans where status in ('aberto','parcial') and direction = 'pegamos') as loans_to_return,
        (select count(*)::int from loans where status in ('aberto','parcial') and due_date < current_date) as loans_overdue,
        (select count(*)::int from loans where status in ('aberto','parcial') and due_date >= current_date and due_date <= current_date + (${s.loanDueDays}::int * interval '1 day')) as loans_due_soon
    `),
    db
      .select({
        id: movements.id,
        code: movements.code,
        type: movements.type,
        status: movements.status,
        supplier: movements.supplier,
        responsible: movements.responsible,
        reason: movements.reason,
        movementDate: movements.movementDate,
        createdAt: movements.createdAt,
        itemCount: sql<number>`(select count(*)::int from movement_items mi where mi.movement_id = "movements"."id")`,
        firstItem: sql<string | null>`(select i.name from movement_items mi join items i on i.id = mi.item_id where mi.movement_id = "movements"."id" order by mi.created_at asc limit 1)`,
        sourceName: sql<string | null>`(select sl.name from storage_locations sl where sl.id = "movements"."source_location_id")`,
        destName: sql<string | null>`(select sl.name from storage_locations sl where sl.id = "movements"."dest_location_id")`,
      })
      .from(movements)
      .orderBy(desc(movements.createdAt))
      .limit(6),
    db.execute(sql`
      select l.id, l.name, l.type, coalesce(sum(sb.quantity::numeric), 0) as qty,
        (select count(*)::int from stock_balances where location_id = l.id and quantity::numeric > 0) as skus
      from storage_locations l
      left join stock_balances sb on sb.location_id = l.id
      where l.active = true
      group by l.id, l.name, l.type
      order by qty desc, l.name asc
    `),
    db.execute(sql`
      select i.id, i.name, i.sku, i.unit, i.min_stock as "minStock", coalesce(b.qty, 0) as qty
      from items i
      left join (select item_id, sum(quantity::numeric) as qty from stock_balances group by item_id) b on b.item_id = i.id
      where i.active = true and i.min_stock::numeric > 0
      order by (coalesce(b.qty, 0) / i.min_stock::numeric) asc
      limit 5
    `),
    db.execute(sql`
      with days as (
        select generate_series(
          (now() at time zone 'America/Sao_Paulo')::date - 6,
          (now() at time zone 'America/Sao_Paulo')::date,
          interval '1 day'
        )::date as d
      )
      select to_char(days.d, 'DD/MM') as day,
        count(m.id) filter (where m.type = 'entrada')::int as entradas,
        count(m.id) filter (where m.type = 'saida')::int as saidas,
        count(m.id) filter (where m.type = 'transferencia')::int as transferencias
      from days
      left join movements m
        on (m.movement_date at time zone 'America/Sao_Paulo')::date = days.d
       and m.status <> 'rascunho'
      group by days.d
      order by days.d
    `),
    db
      .select({
        code: inventoryCounts.code,
        status: inventoryCounts.status,
        scheduledFor: inventoryCounts.scheduledFor,
        locationName: storageLocations.name,
      })
      .from(inventoryCounts)
      .leftJoin(storageLocations, eq(inventoryCounts.locationId, storageLocations.id))
      .where(inArray(inventoryCounts.status, ["aberto", "em_contagem"]))
      .orderBy(
        sql`case when ${inventoryCounts.status} = 'em_contagem' then 0 else 1 end`,
        asc(inventoryCounts.scheduledFor)
      )
      .limit(1),
    lotExposure(),
    getDemandOverview(14, null).catch(() => null),
  ]);

  const t = (totalsRes.rows[0] ?? {}) as Record<string, unknown>;
  const n = (k: string) => Number(t[k] ?? 0);

  return NextResponse.json({
    stats: {
      itemsInStock: n("items_with_stock"),
      itemsActive: n("items_active"),
      locations: n("locations"),
      totalQty: n("total_qty"),
      belowMin: n("below_min"),
      expiring: lots.filter((l) => l.days >= 0 && l.days <= s.expiryDays).length,
      expired: lots.filter((l) => l.days < 0).length,
      drafts: n("drafts"),
      alerts: n("below_min") + lots.filter((l) => l.days <= s.expiryDays).length + n("loans_overdue") + n("loans_due_soon"),
    },
    inventory: { open: n("open_inventories"), next: nextInv[0] ?? null },
    loans: {
      toReceive: n("loans_to_receive"),
      toReturn: n("loans_to_return"),
      overdue: n("loans_overdue"),
      dueSoon: n("loans_due_soon"),
      dueDays: s.loanDueDays,
    },
    demand: demand
      ? {
          nextPeak: demand.summary.nextPeak,
          avgIndex7: demand.summary.avgIndex7,
          criticalCount: demand.criticalCount,
          shoppingTotal: demand.shoppingTotal,
          score: demand.learning.score,
          levelLabel: demand.learning.levelLabel,
          hasHistory: demand.hasHistory,
        }
      : null,
    recent,
    distribution: dist.rows,
    lowItems: low.rows,
    byDay: byDay.rows,
  });
}
