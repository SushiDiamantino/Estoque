import { NextResponse } from "next/server";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Marca alertas como lidos (silencia por 12h, porque a condição pode persistir).
 * body: { keys?: string[], title?: string, severity?: string }  → chaves específicas
 * body: {}                                                      → todos os alertas
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const hours = 12;
  const until = new Date(Date.now() + hours * 3_600_000);
  const sev = body.severity;
  const severity: "critico" | "atencao" | "informativo" = sev === "critico" || sev === "atencao" ? sev : "informativo";

  const keys = Array.isArray(body.keys)
    ? (body.keys as unknown[]).filter((k): k is string => typeof k === "string" && k.length > 0).slice(0, 100)
    : [];

  if (keys.length === 0) {
    // limpa leituras antigas e grava o lote atual em uma única linha "todos"
    await db.delete(alerts).where(eq(alerts.resolved, true));
    await db.insert(alerts).values({
      severity,
      title: typeof body.title === "string" ? body.title.slice(0, 200) : "Alertas marcados como lidos",
      message: `Todos os alertas marcados como lidos por 12h pelo operador`,
      metadata: "__all__",
      resolved: true,
      resolvedAt: until,
    });
    return NextResponse.json({ ok: true, until, count: "all" });
  }

  // remove leituras anteriores das mesmas chaves
  await db.delete(alerts).where(and(eq(alerts.resolved, true), inArray(alerts.metadata, keys)));
  await db.insert(alerts).values(
    keys.map((key) => ({
      severity,
      title: typeof body.title === "string" ? body.title.slice(0, 200) : key,
      message: `Marcado como lido por ${hours}h pelo operador`,
      metadata: key,
      resolved: true,
      resolvedAt: until,
    }))
  );
  return NextResponse.json({ ok: true, until, count: keys.length });
}

/** Reexibe alertas marcados como lidos. */
export async function DELETE() {
  await db.delete(alerts).where(eq(alerts.resolved, true));
  return NextResponse.json({ ok: true });
}
