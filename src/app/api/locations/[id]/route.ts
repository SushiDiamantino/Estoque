import { NextResponse } from "next/server";
import { db } from "@/db";
import { storageLocations, stockBalances } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [row] = await db
    .select()
    .from(storageLocations)
    .where(eq(storageLocations.id, id));
  if (!row) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ location: row });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const patch: Partial<typeof storageLocations.$inferInsert> = {};
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.description !== undefined)
    patch.description = body.description?.trim() || null;
  if (body.type !== undefined) patch.type = body.type;
  if (body.active !== undefined) patch.active = Boolean(body.active);
  if (body.responsible !== undefined)
    patch.responsible = body.responsible?.trim() || null;
  patch.updatedAt = new Date();
  const [row] = await db
    .update(storageLocations)
    .set(patch)
    .where(eq(storageLocations.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ location: row });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const linked = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stockBalances)
    .where(eq(stockBalances.locationId, id));
  if ((linked[0]?.count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Local com saldo vinculado não pode ser excluído. Inative-o." },
      { status: 409 }
    );
  }
  await db.delete(storageLocations).where(eq(storageLocations.id, id));
  return NextResponse.json({ ok: true });
}
