import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export type AppSettings = typeof settings.$inferSelect;
export const SHIFTS = ["Turno manhã", "Turno tarde", "Turno noite", "Integral"] as const;

/** Garante a linha única de configurações e a devolve. */
export async function getSettings(): Promise<AppSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (row) return row;
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
  const [created] = await db.select().from(settings).where(eq(settings.id, 1));
  return created;
}

/** Aceita somente campos conhecidos e valores válidos. */
export function sanitizeSettings(
  body: Record<string, unknown>
): Partial<typeof settings.$inferInsert> {
  const patch: Partial<typeof settings.$inferInsert> = {};
  if (typeof body.restaurantName === "string") {
    const v = body.restaurantName.trim().slice(0, 80);
    if (v) patch.restaurantName = v;
  }
  if (typeof body.document === "string") patch.document = body.document.trim().slice(0, 30) || null;
  if (typeof body.address === "string") patch.address = body.address.trim().slice(0, 200) || null;
  if (typeof body.shift === "string" && (SHIFTS as readonly string[]).includes(body.shift)) {
    patch.shift = body.shift;
  }
  for (const k of ["lowStockNotify", "expiryNotify", "dailyDigest", "loanNotify", "demandNotify", "spreadConsumption", "inventoryAnchor", "priceNotify"] as const) {
    const v = body[k];
    if (typeof v === "boolean") patch[k] = v;
  }
  if (body.expiryDays !== undefined) {
    const n = Math.round(Number(body.expiryDays));
    if (Number.isFinite(n) && n >= 1 && n <= 60) patch.expiryDays = n;
  }
  if (body.loanDueDays !== undefined) {
    const n = Math.round(Number(body.loanDueDays));
    if (Number.isFinite(n) && n >= 0 && n <= 30) patch.loanDueDays = n;
  }
  if (body.demandHorizonDays !== undefined) {
    const n = Math.round(Number(body.demandHorizonDays));
    if (Number.isFinite(n) && n >= 14 && n <= 120) patch.demandHorizonDays = n;
  }
  if (body.demandAlertDays !== undefined) {
    const n = Math.round(Number(body.demandAlertDays));
    if (Number.isFinite(n) && n >= 3 && n <= 60) patch.demandAlertDays = n;
  }
  if (body.priceThreshold !== undefined) {
    const n = Math.round(Number(body.priceThreshold));
    if (Number.isFinite(n) && n >= 2 && n <= 100) patch.priceThreshold = n;
  }
  if (typeof body.purchaseDays === "string") {
    const days = body.purchaseDays
      .split(",")
      .map((x) => Math.round(Number(x.trim())))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    patch.purchaseDays = [...new Set(days)].sort((x, y) => x - y).join(",");
  }
  if (body.advanceDay !== undefined) {
    const n = Math.round(Number(body.advanceDay));
    if (Number.isFinite(n) && n >= 1 && n <= 28) patch.advanceDay = n;
  }
  return patch;
}
