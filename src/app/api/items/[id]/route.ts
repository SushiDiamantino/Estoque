import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  items,
  stockBalances,
  storageLocations,
  movements,
  movementItems,
} from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { isUniqueViolation, isUuid } from "@/lib/stock";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const [row] = await db.select().from(items).where(eq(items.id, id));
  if (!row) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const [balances, history] = await Promise.all([
    db
      .select({
        locationId: stockBalances.locationId,
        locationName: storageLocations.name,
        locationType: storageLocations.type,
        quantity: stockBalances.quantity,
        updatedAt: stockBalances.updatedAt,
      })
      .from(stockBalances)
      .innerJoin(storageLocations, eq(stockBalances.locationId, storageLocations.id))
      .where(eq(stockBalances.itemId, id))
      .orderBy(desc(stockBalances.quantity)),
    db
      .select({
        movementId: movements.id,
        code: movements.code,
        type: movements.type,
        status: movements.status,
        reason: movements.reason,
        movementDate: movements.movementDate,
        quantity: movementItems.quantity,
        lotCode: movementItems.lotCode,
        expiryDate: movementItems.expiryDate,
      })
      .from(movementItems)
      .innerJoin(movements, eq(movementItems.movementId, movements.id))
      .where(eq(movementItems.itemId, id))
      .orderBy(desc(movements.createdAt))
      .limit(15),
  ]);

  return NextResponse.json({ item: row, balances, history });
}

const str = (v: unknown, max = 200) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });

  const patch: Partial<typeof items.$inferInsert> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    patch.name = name.slice(0, 120);
  }
  if (body.sku !== undefined) {
    const sku = String(body.sku).trim().toUpperCase().slice(0, 40);
    if (!sku) return NextResponse.json({ error: "SKU não pode ficar vazio" }, { status: 400 });
    patch.sku = sku;
  }
  if (body.barcode !== undefined) patch.barcode = str(body.barcode, 64);
  if (body.description !== undefined) patch.description = str(body.description, 1000);
  if (body.categoryId !== undefined) {
    if (body.categoryId && !isUuid(body.categoryId)) {
      return NextResponse.json({ error: "Categoria inválida" }, { status: 400 });
    }
    patch.categoryId = isUuid(body.categoryId) ? body.categoryId : null;
  }
  if (body.unit !== undefined) patch.unit = str(body.unit, 12) ?? "un";
  if (body.minStock !== undefined) {
    const v = num(body.minStock);
    if (v === null) return NextResponse.json({ error: "Estoque mínimo inválido" }, { status: 400 });
    patch.minStock = String(v);
  }
  if (body.maxStock !== undefined) patch.maxStock = String(num(body.maxStock) ?? 0);
  if (body.lotControl !== undefined) patch.lotControl = Boolean(body.lotControl);
  if (body.expiryControl !== undefined) patch.expiryControl = Boolean(body.expiryControl);
  if (body.perishable !== undefined) patch.perishable = Boolean(body.perishable);
  if (body.active !== undefined) patch.active = Boolean(body.active);
  if (body.costPrice !== undefined) patch.costPrice = String(num(body.costPrice) ?? 0);
  if (body.supplier !== undefined) patch.supplier = str(body.supplier, 120);
  if (body.leadTimeDays !== undefined) patch.leadTimeDays = Math.min(90, Math.round(num(body.leadTimeDays) ?? 0));
  patch.updatedAt = new Date();

  try {
    const [row] = await db.update(items).set(patch).where(eq(items.id, id)).returning();
    if (!row) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json({ item: row });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "SKU já cadastrado em outro item." }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Erro ao atualizar item" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const [used] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(movementItems)
    .where(eq(movementItems.itemId, id));
  if ((used?.count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Item com movimentações não pode ser excluído. Inative-o para preservar o histórico." },
      { status: 409 }
    );
  }
  await db.delete(items).where(eq(items.id, id));
  return NextResponse.json({ ok: true });
}
