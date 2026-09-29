import { NextResponse } from "next/server";
import { db } from "@/db";
import { can, currentUser } from "@/lib/auth";
import { purchaseOrderItems, purchaseOrders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { errorResponse, isUuid, StockError } from "@/lib/stock";
import { assertP, getPurchaseDetail, OPEN_PURCHASE, receivePurchase, recalcTotal, type PurchaseStatus } from "@/lib/purchases";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const detail = await getPurchaseDetail(id);
  if (!detail) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(detail);
}

/** Ações: send | receive | cancel | update (itens/dados do rascunho) */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    assertP(body, "Requisição inválida");
    const action = body.action;
    if (action !== "update") {
      const perm = action === "send" ? "purchase.send" : "purchase.receive";
      assertP(can(me.role, perm), "Seu perfil não pode executar esta ação.");
    }

    const result = await db.transaction(async (tx) => {
      const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).for("update");
      assertP(order, "Pedido não encontrado.");
      const status = order.status as PurchaseStatus;

      if (action === "send") {
        assertP(status === "rascunho", "Somente rascunhos podem ser enviados.");
        await tx
          .update(purchaseOrders)
          .set({ status: "enviado", sentAt: new Date(), updatedAt: new Date() })
          .where(eq(purchaseOrders.id, id));
        return { ok: true };
      }

      if (action === "cancel") {
        assertP(OPEN_PURCHASE.includes(status), "Pedido já encerrado.");
        const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
        assertP(reason.length >= 3, "Justifique o cancelamento (mín. 3 caracteres).");
        const lines = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.orderId, id));
        assertP(
          lines.every((l) => Number(l.receivedQty) <= 0),
          "Pedido já teve recebimento. Finalize o que falta ou receba o restante."
        );
        await tx
          .update(purchaseOrders)
          .set({ status: "cancelado", cancelReason: reason, closedAt: new Date(), updatedAt: new Date() })
          .where(eq(purchaseOrders.id, id));
        return { ok: true };
      }

      if (action === "receive") {
        const lines = Array.isArray(body.lines) ? (body.lines as Record<string, unknown>[]) : [];
        return receivePurchase(tx, id, {
          lines: lines.map((l) => ({
            lineId: String(l.lineId ?? ""),
            quantity: Number(l.quantity),
            unitCost: l.unitCost === undefined || l.unitCost === "" ? undefined : Number(l.unitCost),
            lotCode: typeof l.lotCode === "string" ? l.lotCode : undefined,
            expiryDate: typeof l.expiryDate === "string" && DAY_RE.test(l.expiryDate) ? l.expiryDate : undefined,
          })),
          invoiceNumber: typeof body.invoiceNumber === "string" ? body.invoiceNumber : undefined,
          receiptDate: typeof body.receiptDate === "string" && DAY_RE.test(body.receiptDate) ? body.receiptDate : undefined,
          responsible: typeof body.responsible === "string" ? body.responsible : undefined,
          notes: typeof body.notes === "string" ? body.notes : undefined,
        });
      }

      if (action === "update") {
        assertP(status === "rascunho", "Somente rascunhos podem ser editados.");
        const patch: Partial<typeof purchaseOrders.$inferInsert> = { updatedAt: new Date() };
        if (typeof body.supplier === "string" && body.supplier.trim()) patch.supplier = body.supplier.trim().slice(0, 120);
        if (typeof body.contact === "string") patch.contact = body.contact.trim().slice(0, 120) || null;
        if (typeof body.responsible === "string") patch.responsible = body.responsible.trim().slice(0, 80) || null;
        if (typeof body.notes === "string") patch.notes = body.notes.trim().slice(0, 500) || null;
        if (typeof body.expectedDate === "string" && DAY_RE.test(body.expectedDate)) patch.expectedDate = body.expectedDate;
        if (body.kind === "emergencial" || body.kind === "programada") patch.kind = body.kind;
        await tx.update(purchaseOrders).set(patch).where(eq(purchaseOrders.id, id));

        if (Array.isArray(body.items)) {
          const lines = (body.items as Record<string, unknown>[])
            .filter((l) => isUuid(l.itemId) && Number(l.quantity) > 0)
            .map((l) => ({
              itemId: l.itemId as string,
              quantity: Math.round(Number(l.quantity) * 1000) / 1000,
              unitCost: Math.max(0, Math.round(Number(l.unitCost ?? 0) * 100) / 100),
            }));
          assertP(lines.length > 0, "O pedido precisa ter ao menos um item.");
          const ids = new Set(lines.map((l) => l.itemId));
          assertP(ids.size === lines.length, "Item repetido no pedido.");
          await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.orderId, id));
          await tx.insert(purchaseOrderItems).values(
            lines.map((l) => ({ orderId: id, itemId: l.itemId, quantity: String(l.quantity), unitCost: String(l.unitCost) }))
          );
        }
        await recalcTotal(tx, id);
        return { ok: true };
      }

      throw new StockError("Ação inválida.");
    });

    const detail = await getPurchaseDetail(id);
    return NextResponse.json({ ...detail, result });
  } catch (e) {
    return errorResponse(e, "Erro ao atualizar pedido");
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const [order] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
  if (!order) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (order.status !== "rascunho") {
    return NextResponse.json({ error: "Somente rascunhos podem ser excluídos." }, { status: 400 });
  }
  await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  return NextResponse.json({ ok: true });
}
