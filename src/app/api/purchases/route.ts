import { NextResponse } from "next/server";
import { db } from "@/db";
import { items, purchaseOrderItems, purchaseOrders, storageLocations } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { errorResponse, isUuid, StockError } from "@/lib/stock";
import { assertP, nextPurchaseCode, recalcTotal } from "@/lib/purchases";
import { getSettings } from "@/lib/settings";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") ?? "all";
  const q = sp.get("q")?.trim() ?? "";

  const conds = [sql`true`];
  if (status === "open") conds.push(sql`po.status in ('rascunho','enviado','parcial')`);
  else if (["rascunho", "enviado", "parcial", "recebido", "cancelado"].includes(status)) {
    conds.push(sql`po.status = ${status}`);
  }
  if (q) {
    const like = `%${q}%`;
    conds.push(sql`(po.code ilike ${like} or po.supplier ilike ${like} or po.responsible ilike ${like}
      or exists (select 1 from purchase_order_items pi join items i on i.id = pi.item_id where pi.order_id = po.id and i.name ilike ${like}))`);
  }

  const rows = await db.execute(sql`
    select po.id, po.code, po.status::text as status, po.kind, po.supplier, po.contact, po.responsible, po.notes,
      to_char(po.order_date, 'YYYY-MM-DD') as "orderDate",
      to_char(po.expected_date, 'YYYY-MM-DD') as "expectedDate",
      (po.expected_date - current_date)::int as "daysToExpected",
      po.total_value as "totalValue", po.created_at as "createdAt", po.sent_at as "sentAt", po.closed_at as "closedAt",
      l.name as "locationName",
      (select count(*)::int from purchase_order_items pi where pi.order_id = po.id) as "itemCount",
      coalesce((select sum(pi.quantity::numeric) from purchase_order_items pi where pi.order_id = po.id), 0) as "totalQty",
      coalesce((select sum(pi.received_qty::numeric) from purchase_order_items pi where pi.order_id = po.id), 0) as "receivedQty",
      (select string_agg(i.name, ', ' order by i.name) from purchase_order_items pi join items i on i.id = pi.item_id where pi.order_id = po.id) as "itemsLabel"
    from purchase_orders po
    join storage_locations l on l.id = po.location_id
    where ${sql.join(conds, sql` and `)}
    order by case when po.status in ('rascunho','enviado','parcial') then 0 else 1 end,
      po.order_date desc, po.created_at desc
    limit 300
  `);

  const statsRes = await db.execute(sql`
    select
      count(*) filter (where status = 'rascunho')::int as draft,
      count(*) filter (where status = 'enviado')::int as sent,
      count(*) filter (where status = 'parcial')::int as partial,
      count(*) filter (where status = 'recebido')::int as done,
      count(*) filter (where status = 'cancelado')::int as cancelled,
      count(*)::int as total,
      coalesce(sum(total_value::numeric) filter (where status in ('rascunho','enviado','parcial')), 0) as open_value,
      coalesce(sum(total_value::numeric) filter (where status = 'recebido' and order_date >= current_date - interval '30 days'), 0) as month_value,
      count(*) filter (where status in ('enviado','parcial') and expected_date < current_date)::int as late
    from purchase_orders
  `);
  const st = (statsRes.rows[0] ?? {}) as Record<string, unknown>;
  const n = (k: string) => Number(st[k] ?? 0);
  const s = await getSettings();

  return NextResponse.json({
    orders: rows.rows,
    stats: {
      draft: n("draft"),
      sent: n("sent"),
      partial: n("partial"),
      done: n("done"),
      cancelled: n("cancelled"),
      total: n("total"),
      openValue: n("open_value"),
      monthValue: n("month_value"),
      late: n("late"),
    },
    purchaseDays: s.purchaseDays ?? "",
  });
}

type LineIn = { itemId?: unknown; quantity?: unknown; unitCost?: unknown; notes?: unknown };

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    assertP(body, "Requisição inválida");
    const supplier = String(body.supplier ?? "").trim().slice(0, 120);
    assertP(supplier, "Informe o fornecedor.");
    assertP(isUuid(body.locationId), "Selecione o local de entrega.");
    const orderDate = typeof body.orderDate === "string" && DAY_RE.test(body.orderDate) ? body.orderDate : todayIso();
    const expectedDate = typeof body.expectedDate === "string" && DAY_RE.test(body.expectedDate) ? body.expectedDate : null;
    if (expectedDate) assertP(expectedDate >= orderDate, "A previsão de entrega não pode ser anterior ao pedido.");
    const kind = body.kind === "emergencial" ? "emergencial" : "programada";

    const raw = Array.isArray(body.items) ? (body.items as LineIn[]) : [];
    const seen = new Set<string>();
    const lines = raw
      .filter((l) => isUuid(l.itemId) && Number(l.quantity) > 0)
      .map((l, i) => {
        assertP(!seen.has(l.itemId as string), `Linha ${i + 1}: item repetido no pedido.`);
        seen.add(l.itemId as string);
        return {
          itemId: l.itemId as string,
          quantity: Math.round(Number(l.quantity) * 1000) / 1000,
          unitCost: Math.max(0, Math.round(Number(l.unitCost ?? 0) * 100) / 100),
          notes: typeof l.notes === "string" ? l.notes.trim().slice(0, 200) || null : null,
        };
      });
    assertP(lines.length > 0, "Adicione ao menos um item ao pedido.");

    const [loc] = await db.select().from(storageLocations).where(eq(storageLocations.id, body.locationId as string));
    assertP(loc, "Local não encontrado.");
    const found = await db
      .select({ id: items.id, cost: items.costPrice, active: items.active, name: items.name })
      .from(items)
      .where(inArray(items.id, lines.map((l) => l.itemId)));
    assertP(found.length === lines.length, "Um ou mais itens não foram encontrados.");
    for (const l of lines) {
      const it = found.find((f) => f.id === l.itemId)!;
      assertP(it.active, `Item "${it.name}" está inativo.`);
      if (l.unitCost === 0) l.unitCost = Math.round(Number(it.cost ?? 0) * 100) / 100;
    }

    const created = await db.transaction(async (tx) => {
      const code = await nextPurchaseCode(tx);
      const [order] = await tx
        .insert(purchaseOrders)
        .values({
          code,
          status: body.status === "enviado" ? "enviado" : "rascunho",
          kind,
          supplier,
          contact: typeof body.contact === "string" ? body.contact.trim().slice(0, 120) || null : null,
          locationId: body.locationId as string,
          responsible: typeof body.responsible === "string" && body.responsible.trim() ? body.responsible.trim().slice(0, 80) : "Operador de Estoque",
          notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 500) || null : null,
          orderDate,
          expectedDate,
          sentAt: body.status === "enviado" ? new Date() : null,
        })
        .returning();
      await tx.insert(purchaseOrderItems).values(
        lines.map((l) => ({
          orderId: order.id,
          itemId: l.itemId,
          quantity: String(l.quantity),
          unitCost: String(l.unitCost),
          notes: l.notes,
        }))
      );
      await recalcTotal(tx, order.id);
      return order;
    });

    return NextResponse.json({ order: created }, { status: 201 });
  } catch (e) {
    if (e instanceof StockError) return errorResponse(e, "");
    return errorResponse(e, "Erro ao criar pedido de compra");
  }
}
