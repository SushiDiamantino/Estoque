import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories, items } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [row] = await db.select().from(categories).where(eq(categories.id, id));
  if (!row) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  const linked = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(items)
    .where(eq(items.categoryId, id));
  return NextResponse.json({ category: row, itemCount: linked[0]?.count ?? 0 });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const patch: Partial<typeof categories.$inferInsert> = {};
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.description !== undefined)
    patch.description = body.description?.trim() || null;
  if (body.icon !== undefined) patch.icon = body.icon;
  if (body.color !== undefined) patch.color = body.color;
  if (body.active !== undefined) patch.active = Boolean(body.active);
  patch.updatedAt = new Date();
  const [row] = await db
    .update(categories)
    .set(patch)
    .where(eq(categories.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  return NextResponse.json({ category: row });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const linked = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(items)
    .where(eq(items.categoryId, id));
  if ((linked[0]?.count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Categoria com itens vinculados não pode ser excluída." },
      { status: 409 }
    );
  }
  await db.delete(categories).where(eq(categories.id, id));
  return NextResponse.json({ ok: true });
}
