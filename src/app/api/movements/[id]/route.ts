import { NextResponse } from "next/server";
import { db } from "@/db";
import { can, currentUser } from "@/lib/auth";
import { movements, movementItems, items, storageLocations } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  applyDeltas,
  computeDeltas,
  errorResponse,
  isUuid,
  StockError,
} from "@/lib/stock";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  const [mov] = await db.select().from(movements).where(eq(movements.id, id));
  if (!mov) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });

  const lines = await db
    .select({
      id: movementItems.id,
      itemId: movementItems.itemId,
      itemName: items.name,
      itemSku: items.sku,
      itemUnit: items.unit,
      quantity: movementItems.quantity,
      unitCost: movementItems.unitCost,
      lotCode: movementItems.lotCode,
      expiryDate: movementItems.expiryDate,
    })
    .from(movementItems)
    .leftJoin(items, eq(movementItems.itemId, items.id))
    .where(eq(movementItems.movementId, id));

  const locs = await db
    .select({ id: storageLocations.id, name: storageLocations.name })
    .from(storageLocations);
  const locMap = new Map(locs.map((l) => [l.id, l.name]));

  return NextResponse.json({
    movement: {
      ...mov,
      sourceName: mov.sourceLocationId ? locMap.get(mov.sourceLocationId) ?? null : null,
      destName: mov.destLocationId ? locMap.get(mov.destLocationId) ?? null : null,
    },
    items: lines,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!isUuid(id)) throw new StockError("Movimentação não encontrada.", 404);
    const me = await currentUser();
    if (!me) throw new StockError("Sessão expirada. Entre novamente.", 401);
    const body = await req.json().catch(() => ({}));
    const action = body.action as "confirm" | "reverse" | undefined;
    if (action !== "confirm" && action !== "reverse") {
      throw new StockError("Ação inválida.");
    }
    if (action === "reverse" && !can(me.role, "movement.reverse")) {
      throw new StockError("Seu perfil não pode estornar movimentações.", 403);
    }
    if (action === "confirm" && !can(me.role, "movement.confirm")) {
      throw new StockError("Seu perfil não pode confirmar movimentações.", 403);
    }

    const updated = await db.transaction(async (tx) => {
      // trava a movimentação para evitar confirmação/estorno duplicado
      const [mov] = await tx
        .select()
        .from(movements)
        .where(eq(movements.id, id))
        .for("update");
      if (!mov) throw new StockError("Movimentação não encontrada.", 404);

      const lines = await tx
        .select({ itemId: movementItems.itemId, quantity: movementItems.quantity })
        .from(movementItems)
        .where(eq(movementItems.movementId, id));

      if (action === "confirm") {
        if (mov.status !== "rascunho") {
          throw new StockError("Somente rascunhos podem ser confirmados.");
        }
        await applyDeltas(tx, computeDeltas(mov, lines, 1));
        const [u] = await tx
          .update(movements)
          .set({ status: "confirmada", confirmedAt: new Date(), updatedAt: new Date() })
          .where(eq(movements.id, id))
          .returning();
        return u;
      }

      if (mov.status !== "confirmada") {
        throw new StockError("Somente movimentações confirmadas podem ser estornadas.");
      }
      if (mov.loanId) {
        throw new StockError("Esta movimentação pertence a um empréstimo. Faça o acerto pelo módulo Empréstimos (devolução ou cancelamento).");
      }
      await applyDeltas(tx, computeDeltas(mov, lines, -1));
      const reason = typeof body.reason === "string" && body.reason.trim()
        ? `\n[Estorno] ${body.reason.trim()}`
        : "\n[Estorno] sem justificativa";
      const [u] = await tx
        .update(movements)
        .set({
          status: "estornada",
          notes: `${mov.notes ?? ""}${reason} — ${new Date().toLocaleString("pt-BR")}`.trim(),
          updatedAt: new Date(),
        })
        .where(eq(movements.id, id))
        .returning();
      return u;
    });

    return NextResponse.json({ movement: updated });
  } catch (e) {
    return errorResponse(e, "Erro ao processar movimentação.");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  const [mov] = await db.select().from(movements).where(eq(movements.id, id));
  if (!mov) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  if (mov.status !== "rascunho") {
    return NextResponse.json(
      { error: "Somente rascunhos podem ser excluídos." },
      { status: 400 }
    );
  }
  await db.delete(movements).where(eq(movements.id, id));
  return NextResponse.json({ ok: true });
}
