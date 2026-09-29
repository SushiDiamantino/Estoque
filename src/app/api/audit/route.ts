import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { currentUser } from "@/lib/auth";

/** Histórico de atividades — somente Administrador. */
export async function GET() {
  const me = await currentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "Somente o Administrador consulta a auditoria." }, { status: 403 });
  }
  const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
  return NextResponse.json({ logs });
}
