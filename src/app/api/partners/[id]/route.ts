import { NextResponse } from "next/server";
import { db } from "@/db";
import { loans, partners } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { isUniqueViolation, isUuid } from "@/lib/stock";

const str = (v: unknown, max = 200) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });

  const patch: Partial<typeof partners.$inferInsert> = { updatedAt: new Date() };
  if (body.name !== undefined) {
    const name = str(body.name, 120);
    if (!name) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    patch.name = name;
  }
  if (body.contact !== undefined) patch.contact = str(body.contact, 120);
  if (body.phone !== undefined) patch.phone = str(body.phone, 40);
  if (body.email !== undefined) patch.email = str(body.email, 120);
  if (body.notes !== undefined) patch.notes = str(body.notes, 500);
  if (body.active !== undefined) {
    patch.active = Boolean(body.active);
    if (!patch.active) {
      const [open] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(loans)
        .where(sql`${loans.partnerId} = ${id}::uuid and ${loans.status} in ('aberto', 'parcial')`);
      if ((open?.count ?? 0) > 0) {
        return NextResponse.json(
          { error: `Parceiro tem ${open.count} empréstimo(s) em aberto. Quite-os antes de inativar.` },
          { status: 409 }
        );
      }
    }
  }
  try {
    const [row] = await db.update(partners).set(patch).where(eq(partners.id, id)).returning();
    if (!row) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json({ partner: row });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "Já existe um parceiro com esse nome." }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Erro ao atualizar parceiro" }, { status: 500 });
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
    .from(loans)
    .where(eq(loans.partnerId, id));
  if ((used?.count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Parceiro com histórico de empréstimos não pode ser excluído. Inative-o." },
      { status: 409 }
    );
  }
  await db.delete(partners).where(eq(partners.id, id));
  return NextResponse.json({ ok: true });
}
