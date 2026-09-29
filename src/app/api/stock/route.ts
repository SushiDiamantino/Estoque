import { NextResponse } from "next/server";
import { db } from "@/db";
import { stockBalances } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isUuid } from "@/lib/stock";

/** Saldo por item em um local: { balances: { [itemId]: number } } */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("locationId");
  if (!isUuid(locationId)) return NextResponse.json({ balances: {} });

  const rows = await db
    .select({ itemId: stockBalances.itemId, quantity: stockBalances.quantity })
    .from(stockBalances)
    .where(eq(stockBalances.locationId, locationId));

  const balances: Record<string, number> = {};
  for (const r of rows) balances[r.itemId] = Number(r.quantity);
  return NextResponse.json({ balances });
}
