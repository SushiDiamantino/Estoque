import { NextResponse } from "next/server";
import { db } from "@/db";
import { storageLocations } from "@/db/schema";
import { eq, sql, ilike, or, and, type SQL } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const type = searchParams.get("type") ?? "all";
  const status = searchParams.get("status") ?? "all";

  let query = db
    .select({
      id: storageLocations.id,
      name: storageLocations.name,
      description: storageLocations.description,
      type: storageLocations.type,
      active: storageLocations.active,
      responsible: storageLocations.responsible,
      createdAt: storageLocations.createdAt,
      itemCount: sql<number>`(select count(*)::int from stock_balances where stock_balances.location_id = ${storageLocations.id} and stock_balances.quantity::numeric > 0)`,
      totalQty: sql<number>`coalesce((select sum(stock_balances.quantity::numeric) from stock_balances where stock_balances.location_id = ${storageLocations.id}), 0)`,
    })
    .from(storageLocations)
    .$dynamic();

  const conds: SQL[] = [];
  if (q) {
    const c = or(
      ilike(storageLocations.name, `%${q}%`),
      ilike(storageLocations.description, `%${q}%`)
    );
    if (c) conds.push(c);
  }
  if (status === "active") conds.push(eq(storageLocations.active, true));
  if (status === "inactive") conds.push(eq(storageLocations.active, false));
  if (conds.length) query = query.where(and(...conds));

  let rows = await query;
  if (type !== "all") {
    rows = rows.filter((r) => r.type === type);
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const total = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(storageLocations);
  const activeRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(storageLocations)
    .where(eq(storageLocations.active, true));

  return NextResponse.json({
    locations: rows,
    stats: {
      total: total[0]?.count ?? 0,
      active: activeRows[0]?.count ?? 0,
      inactive: (total[0]?.count ?? 0) - (activeRows[0]?.count ?? 0),
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description, type, active, responsible, capacity, address } = body;
    if (!name?.trim()) {
      return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    }
    const [row] = await db
      .insert(storageLocations)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
        type: type || "ambiente",
        active: active ?? true,
        responsible: responsible?.trim() || null,
        capacity: capacity?.trim() || null,
        address: address?.trim() || null,
      })
      .returning();
    return NextResponse.json({ location: row }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao criar local" }, { status: 500 });
  }
}
