import { NextResponse } from "next/server";
import { db } from "@/db";
import { demandEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isUuid } from "@/lib/stock";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });

  const patch: Partial<typeof demandEvents.$inferInsert> = { updatedAt: new Date() };
  if (body.title !== undefined) {
    const t = String(body.title).trim().slice(0, 120);
    if (!t) return NextResponse.json({ error: "Título é obrigatório" }, { status: 400 });
    patch.title = t;
  }
  if (body.kind !== undefined) patch.kind = String(body.kind).slice(0, 30);
  if (body.multiplier !== undefined) {
    const m = Number(body.multiplier);
    if (!Number.isFinite(m) || m < 0.3 || m > 3) {
      return NextResponse.json({ error: "Multiplicador deve ficar entre 0,3 e 3" }, { status: 400 });
    }
    patch.multiplier = String(m);
  }
  if (body.windowBefore !== undefined) patch.windowBefore = Math.min(7, Math.max(0, Math.round(Number(body.windowBefore))));
  if (body.windowAfter !== undefined) patch.windowAfter = Math.min(7, Math.max(0, Math.round(Number(body.windowAfter))));
  if (body.date !== undefined) {
    if (body.date && !DAY_RE.test(String(body.date))) {
      return NextResponse.json({ error: "Data inválida" }, { status: 400 });
    }
    patch.date = (body.date as string) || null;
    if (body.date) {
      patch.month = null;
      patch.day = null;
    }
  }
  if (body.month !== undefined || body.day !== undefined) {
    const mo = Math.round(Number(body.month));
    const da = Math.round(Number(body.day));
    if (mo < 1 || mo > 12 || da < 1 || da > 31) {
      return NextResponse.json({ error: "Mês/dia inválidos" }, { status: 400 });
    }
    patch.month = mo;
    patch.day = da;
    patch.date = null;
  }
  if (body.notes !== undefined) patch.notes = String(body.notes).trim().slice(0, 500) || null;
  if (body.active !== undefined) patch.active = Boolean(body.active);

  const [row] = await db.update(demandEvents).set(patch).where(eq(demandEvents.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json({ event: row });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  await db.delete(demandEvents).where(eq(demandEvents.id, id));
  return NextResponse.json({ ok: true });
}
