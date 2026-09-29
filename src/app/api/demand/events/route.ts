import { NextResponse } from "next/server";
import { db } from "@/db";
import { demandEvents } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { isUniqueViolation } from "@/lib/stock";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const rows = await db.select().from(demandEvents).orderBy(desc(demandEvents.createdAt));
  return NextResponse.json({ events: rows });
}

/**
 * Cria evento personalizado (data única ou anual) ou ajuste de evento do sistema.
 * body: { title, kind?, date? | (month+day), multiplier?, windowBefore?, windowAfter?, notes?, systemKey? }
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  try {
    const title = String(body.title ?? "").trim().slice(0, 120);
    if (!title) return NextResponse.json({ error: "Informe o título do evento" }, { status: 400 });
    const kind = String(body.kind ?? "custom").slice(0, 30);
    const systemKey = typeof body.systemKey === "string" && body.systemKey ? body.systemKey.slice(0, 80) : null;
    const mult = Number(body.multiplier ?? 1.3);
    if (!Number.isFinite(mult) || mult < 0.3 || mult > 3) {
      return NextResponse.json({ error: "Multiplicador deve ficar entre 0,3 e 3" }, { status: 400 });
    }
    const wb = Math.min(7, Math.max(0, Math.round(Number(body.windowBefore ?? 0))));
    const wa = Math.min(7, Math.max(0, Math.round(Number(body.windowAfter ?? 0))));

    let date: string | null = null;
    let month: number | null = null;
    let day: number | null = null;
    if (!systemKey) {
      if (typeof body.date === "string" && DAY_RE.test(body.date)) {
        date = body.date;
      } else if (body.month && body.day) {
        month = Math.round(Number(body.month));
        day = Math.round(Number(body.day));
        if (month < 1 || month > 12 || day < 1 || day > 31) {
          return NextResponse.json({ error: "Mês/dia inválidos" }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: "Informe a data (única ou mês/dia anual)" }, { status: 400 });
      }
    }
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) || null : null;

    if (systemKey) {
      const [existing] = await db.select().from(demandEvents).where(eq(demandEvents.systemKey, systemKey));
      if (existing) {
        const [row] = await db
          .update(demandEvents)
          .set({ title, multiplier: String(mult), windowBefore: wb, windowAfter: wa, notes, active: true, updatedAt: new Date() })
          .where(eq(demandEvents.id, existing.id))
          .returning();
        return NextResponse.json({ event: row });
      }
    }
    const [row] = await db
      .insert(demandEvents)
      .values({ title, kind, systemKey, date, month, day, multiplier: String(mult), windowBefore: wb, windowAfter: wa, notes })
      .returning();
    return NextResponse.json({ event: row }, { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: "Este evento do sistema já tem um ajuste." }, { status: 409 });
    console.error(e);
    return NextResponse.json({ error: "Erro ao salvar evento" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  // ?systemKey=xxx → remove ajuste de evento do sistema (volta ao padrão)
  const systemKey = new URL(req.url).searchParams.get("systemKey");
  if (systemKey) {
    await db.delete(demandEvents).where(eq(demandEvents.systemKey, systemKey));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Informe o evento" }, { status: 400 });
}
