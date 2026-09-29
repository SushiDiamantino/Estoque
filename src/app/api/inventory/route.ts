import { NextResponse } from "next/server";
import { db } from "@/db";
import { inventoryCounts, storageLocations } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { isUuid, nextInventoryCode, parseDay } from "@/lib/stock";

export async function GET() {
  const rows = await db
    .select({
      id: inventoryCounts.id,
      code: inventoryCounts.code,
      locationId: inventoryCounts.locationId,
      status: inventoryCounts.status,
      responsible: inventoryCounts.responsible,
      notes: inventoryCounts.notes,
      scheduledFor: inventoryCounts.scheduledFor,
      finishedAt: inventoryCounts.finishedAt,
      createdAt: inventoryCounts.createdAt,
      locationName: storageLocations.name,
      totalLines: sql<number>`(select count(*)::int from inventory_count_items ici where ici.count_id = ${inventoryCounts.id})`,
      countedLines: sql<number>`(select count(*)::int from inventory_count_items ici where ici.count_id = ${inventoryCounts.id} and ici.counted_qty is not null)`,
      divergences: sql<number>`(select count(*)::int from inventory_count_items ici where ici.count_id = ${inventoryCounts.id} and ici.counted_qty is not null and ici.counted_qty <> ici.expected_qty)`,
    })
    .from(inventoryCounts)
    .leftJoin(storageLocations, eq(inventoryCounts.locationId, storageLocations.id))
    .orderBy(desc(inventoryCounts.createdAt))
    .limit(200);

  return NextResponse.json({ counts: rows });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { locationId, responsible, notes, scheduledFor } = body;
    const row = await db.transaction(async (tx) => {
      const code = await nextInventoryCode(tx);
      const [created] = await tx
        .insert(inventoryCounts)
        .values({
          code,
          locationId: isUuid(locationId) ? locationId : null,
          responsible: typeof responsible === "string" && responsible.trim() ? responsible.trim().slice(0, 80) : "Operador de Estoque",
          notes: typeof notes === "string" && notes.trim() ? notes.trim().slice(0, 500) : null,
          scheduledFor: scheduledFor ? parseDay(scheduledFor) : null,
          status: "aberto",
        })
        .returning();
      return created;
    });
    return NextResponse.json({ count: row }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao criar inventário" }, { status: 500 });
  }
}
