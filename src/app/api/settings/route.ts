import { NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSettings, sanitizeSettings } from "@/lib/settings";

export async function GET() {
  return NextResponse.json({ settings: await getSettings() });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  const patch = sanitizeSettings(body);
  await getSettings(); // garante a linha
  const [row] = await db
    .update(settings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(settings.id, 1))
    .returning();
  return NextResponse.json({ settings: row });
}

export async function PATCH(req: Request) {
  return PUT(req);
}
