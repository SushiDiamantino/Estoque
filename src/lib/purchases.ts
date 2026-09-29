import { db } from "@/db";
import {
  items,
  movementItems,
  movements,
  purchaseOrderItems,
  purchaseOrders,
  storageLocations,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { applyDeltas, computeDeltas, nextMovementCode, parseDay, StockError, type Tx } from "@/lib/stock";

export type PurchaseStatus = "rascunho" | "enviado" | "parcial" | "recebido" | "cancelado";
export const OPEN_PURCHASE: PurchaseStatus[] = ["rascunho", "enviado", "parcial"];
export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado ao fornecedor",
  parcial: "Recebido parcialmente",
  recebido: "Recebido",
  cancelado: "Cancelado",
};
const EPS = 0.0005;
const q3 = (n: number) => Math.round(n * 1000) / 1000;
const money2 = (n: number) => Math.round(n * 100) / 100;

export function assertP(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new StockError(msg);
}

/** Código sequencial PC-ANO-NNNN com trava por transação. */
export async function nextPurchaseCode(tx: Tx): Promise<string> {
  const base = `PC-${new Date().getFullYear()}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${base}::text))`);
  const [row] = await tx
    .select({ max: sql<number>`coalesce(max((substring(${purchaseOrders.code} from '([0-9]+)$'))::int), 0)` })
    .from(purchaseOrders)
    .where(sql`${purchaseOrders.code} like ${base + "-%"}`);
  return `${base}-${String(Number(row?.max ?? 0) + 1).padStart(4, "0")}`;
}

export async function recalcTotal(tx: Tx, orderId: string) {
  const [row] = await tx
    .select({ total: sql<string>`coalesce(sum(${purchaseOrderItems.quantity}::numeric * ${purchaseOrderItems.unitCost}::numeric), 0)` })
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.orderId, orderId));
  await tx
    .update(purchaseOrders)
    .set({ totalValue: String(money2(Number(row?.total ?? 0))), updatedAt: new Date() })
    .where(eq(purchaseOrders.id, orderId));
}

export type PurchaseDetail = Awaited<ReturnType<typeof getPurchaseDetail>>;

export async function getPurchaseDetail(id: string) {
  const [row] = await db
    .select({
      order: purchaseOrders,
      locationName: storageLocations.name,
    })
    .from(purchaseOrders)
    .innerJoin(storageLocations, eq(purchaseOrders.locationId, storageLocations.id))
    .where(eq(purchaseOrders.id, id));
  if (!row) return null;

  const lines = await db
    .select({
      id: purchaseOrderItems.id,
      itemId: purchaseOrderItems.itemId,
      name: items.name,
      sku: items.sku,
      unit: items.unit,
      quantity: purchaseOrderItems.quantity,
      unitCost: purchaseOrderItems.unitCost,
      receivedQty: purchaseOrderItems.receivedQty,
      notes: purchaseOrderItems.notes,
      stock: sql<string>`coalesce((select sum(sb.quantity::numeric) from stock_balances sb where sb.item_id = ${purchaseOrderItems.itemId}), 0)`,
    })
    .from(purchaseOrderItems)
    .innerJoin(items, eq(purchaseOrderItems.itemId, items.id))
    .where(eq(purchaseOrderItems.orderId, id))
    .orderBy(items.name);

  const receipts = await db
    .select({
      id: movements.id,
      code: movements.code,
      date: movements.movementDate,
      invoice: movements.invoiceNumber,
      total: movements.totalCost,
      status: movements.status,
    })
    .from(movements)
    .where(and(eq(movements.purchaseOrderId, id), eq(movements.type, "entrada")))
    .orderBy(movements.createdAt);

  const totals = lines.reduce(
    (a, l) => {
      const qty = Number(l.quantity);
      const rec = Number(l.receivedQty);
      return {
        qty: q3(a.qty + qty),
        received: q3(a.received + rec),
        pending: q3(a.pending + Math.max(0, qty - rec)),
        value: money2(a.value + qty * Number(l.unitCost)),
        receivedValue: money2(a.receivedValue + rec * Number(l.unitCost)),
      };
    },
    { qty: 0, received: 0, pending: 0, value: 0, receivedValue: 0 }
  );

  return {
    order: { ...row.order, locationName: row.locationName },
    items: lines.map((l) => ({
      ...l,
      quantity: Number(l.quantity),
      unitCost: Number(l.unitCost),
      receivedQty: Number(l.receivedQty),
      pending: Math.max(0, q3(Number(l.quantity) - Number(l.receivedQty))),
      stock: Number(l.stock),
      total: money2(Number(l.quantity) * Number(l.unitCost)),
    })),
    receipts,
    totals,
  };
}

/**
 * Recebimento (total ou parcial): grava as quantidades, cria a entrada confirmada
 * vinculada ao pedido e aplica no saldo do local. Tudo na mesma transação.
 */
export async function receivePurchase(
  tx: Tx,
  orderId: string,
  input: {
    lines: { lineId: string; quantity: number; unitCost?: number; lotCode?: string; expiryDate?: string }[];
    invoiceNumber?: string;
    receiptDate?: string;
    responsible?: string;
    notes?: string;
  }
) {
  const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId)).for("update");
  assertP(order, "Pedido não encontrado.");
  assertP(OPEN_PURCHASE.includes(order.status as PurchaseStatus), `Pedido ${PURCHASE_STATUS_LABEL[order.status as PurchaseStatus].toLowerCase()} não aceita recebimento.`);

  const existing = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.orderId, orderId));
  const byId = new Map(existing.map((l) => [l.id, l]));
  const meta = await tx
    .select({ id: items.id, name: items.name, lotControl: items.lotControl, expiryControl: items.expiryControl })
    .from(items)
    .where(sql`${items.id} in (${sql.join(existing.map((l) => sql`${l.itemId}::uuid`), sql`, `)})`);
  const metaById = new Map(meta.map((m) => [m.id, m]));

  const applied: { itemId: string; quantity: number; unitCost: number; lotCode?: string | null; expiryDate?: string | null }[] = [];
  for (const l of input.lines) {
    const line = byId.get(l.lineId);
    assertP(line, "Linha do pedido não encontrada.");
    const qty = q3(Number(l.quantity));
    if (!(qty > 0)) continue;
    const pending = Number(line.quantity) - Number(line.receivedQty);
    assertP(qty <= pending + EPS, `"${metaById.get(line.itemId)?.name ?? "item"}": recebimento de ${qty} excede o pendente de ${q3(pending)}.`);
    const it = metaById.get(line.itemId);
    if (it?.lotControl) assertP(l.lotCode?.trim(), `"${it.name}" exige número de lote no recebimento.`);
    if (it?.expiryControl) assertP(l.expiryDate, `"${it.name}" exige data de validade no recebimento.`);
    const unitCost = l.unitCost !== undefined && Number.isFinite(Number(l.unitCost)) ? money2(Number(l.unitCost)) : Number(line.unitCost);
    applied.push({ itemId: line.itemId, quantity: qty, unitCost, lotCode: l.lotCode?.trim() || null, expiryDate: l.expiryDate || null });
    await tx
      .update(purchaseOrderItems)
      .set({ receivedQty: String(q3(Number(line.receivedQty) + qty)), unitCost: String(unitCost) })
      .where(eq(purchaseOrderItems.id, line.id));
  }
  assertP(applied.length > 0, "Informe ao menos uma quantidade recebida.");

  const code = await nextMovementCode(tx, "entrada");
  const total = money2(applied.reduce((a, l) => a + l.quantity * l.unitCost, 0));
  const [mov] = await tx
    .insert(movements)
    .values({
      code,
      type: "entrada",
      status: "confirmada",
      supplier: order.supplier,
      invoiceNumber: input.invoiceNumber?.trim() || null,
      responsible: input.responsible?.trim() || order.responsible,
      reason: "Recebimento de compra",
      notes: `${order.code}${input.notes ? ` · ${input.notes}` : ""}`,
      destLocationId: order.locationId,
      totalCost: String(total),
      movementDate: parseDay(input.receiptDate),
      confirmedAt: new Date(),
      purchaseOrderId: orderId,
    })
    .returning();

  for (const l of applied) {
    await tx.insert(movementItems).values({
      movementId: mov.id,
      itemId: l.itemId,
      quantity: String(l.quantity),
      unitCost: String(l.unitCost),
      lotCode: l.lotCode,
      expiryDate: l.expiryDate,
    });
  }
  await applyDeltas(
    tx,
    computeDeltas({ type: "entrada", sourceLocationId: null, destLocationId: order.locationId }, applied, 1)
  );

  const after = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.orderId, orderId));
  const fullyReceived = after.every((l) => Number(l.receivedQty) + EPS >= Number(l.quantity));
  const status: PurchaseStatus = fullyReceived ? "recebido" : "parcial";
  await tx
    .update(purchaseOrders)
    .set({ status, closedAt: fullyReceived ? new Date() : null, updatedAt: new Date() })
    .where(eq(purchaseOrders.id, orderId));
  await recalcTotal(tx, orderId);
  return { movementCode: mov.code, status, received: applied.length };
}
