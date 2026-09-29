import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  inventoryCounts,
  inventoryCountItems,
  items,
  movements,
  movementItems,
  stockBalances,
  storageLocations,
} from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  adjustBalance,
  errorResponse,
  isUuid,
  nextMovementCode,
  StockError,
} from "@/lib/stock";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const [count] = await db
    .select({
      id: inventoryCounts.id,
      code: inventoryCounts.code,
      status: inventoryCounts.status,
      locationId: inventoryCounts.locationId,
      locationName: storageLocations.name,
      responsible: inventoryCounts.responsible,
      notes: inventoryCounts.notes,
      finishedAt: inventoryCounts.finishedAt,
    })
    .from(inventoryCounts)
    .leftJoin(storageLocations, eq(inventoryCounts.locationId, storageLocations.id))
    .where(eq(inventoryCounts.id, id));
  if (!count) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const lines = await db
    .select({
      id: inventoryCountItems.id,
      itemId: inventoryCountItems.itemId,
      itemName: items.name,
      itemSku: items.sku,
      itemUnit: items.unit,
      locationId: inventoryCountItems.locationId,
      locationName: storageLocations.name,
      expectedQty: inventoryCountItems.expectedQty,
      countedQty: inventoryCountItems.countedQty,
    })
    .from(inventoryCountItems)
    .innerJoin(items, eq(inventoryCountItems.itemId, items.id))
    .innerJoin(storageLocations, eq(inventoryCountItems.locationId, storageLocations.id))
    .where(eq(inventoryCountItems.countId, id))
    .orderBy(asc(storageLocations.name), asc(items.name));

  return NextResponse.json({ count, lines });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!isUuid(id)) throw new StockError("Inventário não encontrado.", 404);
    const body = await req.json().catch(() => ({}));
    const action = body.action as "start" | "save" | "conclude" | "cancel" | undefined;

    const result = await db.transaction(async (tx) => {
      const [count] = await tx
        .select()
        .from(inventoryCounts)
        .where(eq(inventoryCounts.id, id))
        .for("update");
      if (!count) throw new StockError("Inventário não encontrado.", 404);

      if (action === "start") {
        if (count.status !== "aberto") throw new StockError("Este inventário já foi iniciado.");

        // snapshot do saldo esperado
        let snapshot: { itemId: string; locationId: string; qty: string }[];
        if (count.locationId) {
          // escopo por local: todos os itens ativos (permite achar saldo não registrado)
          const rows = await tx.execute(sql`
            select i.id as "itemId", ${count.locationId}::uuid as "locationId",
              coalesce(sb.quantity, 0)::text as qty
            from items i
            left join stock_balances sb on sb.item_id = i.id and sb.location_id = ${count.locationId}::uuid
            where i.active = true
          `);
          snapshot = rows.rows as typeof snapshot;
        } else {
          // geral: todo saldo existente em locais ativos
          const rows = await tx
            .select({
              itemId: stockBalances.itemId,
              locationId: stockBalances.locationId,
              qty: stockBalances.quantity,
            })
            .from(stockBalances)
            .innerJoin(storageLocations, eq(stockBalances.locationId, storageLocations.id))
            .innerJoin(items, eq(stockBalances.itemId, items.id))
            .where(and(eq(storageLocations.active, true), eq(items.active, true)));
          snapshot = rows;
        }
        if (snapshot.length === 0) {
          throw new StockError(
            count.locationId
              ? "Nenhum item ativo cadastrado para contar."
              : "Não há saldo em nenhum local. Registre entradas antes do inventário geral."
          );
        }
        await tx.insert(inventoryCountItems).values(
          snapshot.map((s) => ({
            countId: id,
            itemId: s.itemId,
            locationId: s.locationId,
            expectedQty: String(s.qty ?? 0),
          }))
        ).onConflictDoNothing();
        await tx
          .update(inventoryCounts)
          .set({ status: "em_contagem" })
          .where(eq(inventoryCounts.id, id));
        return { ok: true, lines: snapshot.length };
      }

      if (action === "save") {
        if (count.status !== "em_contagem") throw new StockError("O inventário não está em contagem.");
        const lines = (Array.isArray(body.lines) ? body.lines : []) as {
          id: string;
          countedQty: number | string | null;
        }[];
        let saved = 0;
        for (const l of lines.slice(0, 2000)) {
          if (!isUuid(l.id)) continue;
          const v = l.countedQty === null || l.countedQty === "" ? null : Number(l.countedQty);
          if (v !== null && (Number.isNaN(v) || v < 0)) continue;
          await tx
            .update(inventoryCountItems)
            .set({ countedQty: v === null ? null : String(v), updatedAt: new Date() })
            .where(and(eq(inventoryCountItems.id, l.id), eq(inventoryCountItems.countId, id)));
          saved++;
        }
        return { ok: true, saved };
      }

      if (action === "conclude") {
        if (count.status !== "em_contagem") throw new StockError("O inventário não está em contagem.");
        const lines = await tx
          .select()
          .from(inventoryCountItems)
          .where(eq(inventoryCountItems.countId, id));
        const counted = lines.filter((l) => l.countedQty !== null);
        if (counted.length === 0) throw new StockError("Nenhum item foi contado ainda.");

        // ajusta ao valor contado, comparando com o saldo ATUAL (movimentos durante a contagem)
        type Adj = { itemId: string; locationId: string; diff: number };
        const adjs: Adj[] = [];
        for (const l of counted) {
          const [bal] = await tx
            .select({ quantity: stockBalances.quantity })
            .from(stockBalances)
            .where(and(eq(stockBalances.itemId, l.itemId), eq(stockBalances.locationId, l.locationId)))
            .for("update");
          const diff = Number(l.countedQty) - Number(bal?.quantity ?? 0);
          if (Math.abs(diff) > 1e-9) adjs.push({ itemId: l.itemId, locationId: l.locationId, diff });
        }

        const codes: string[] = [];
        const groups = new Map<string, Adj[]>();
        for (const a of adjs) {
          const key = `${a.locationId}|${a.diff > 0 ? "in" : "out"}`;
          groups.set(key, [...(groups.get(key) ?? []), a]);
        }
        for (const [key, group] of groups) {
          const [locationId, dir] = key.split("|");
          const type = dir === "in" ? "entrada" : "saida";
          const code = await nextMovementCode(tx, type);
          const [m] = await tx
            .insert(movements)
            .values({
              code,
              type,
              status: "confirmada",
              reason: "Ajuste de inventário",
              responsible: count.responsible,
              notes: `Gerado automaticamente pelo inventário ${count.code}`,
              sourceLocationId: type === "saida" ? locationId : null,
              destLocationId: type === "entrada" ? locationId : null,
              confirmedAt: new Date(),
            })
            .returning();
          await tx.insert(movementItems).values(
            group.map((g) => ({
              movementId: m.id,
              itemId: g.itemId,
              quantity: String(Math.abs(g.diff)),
              unitCost: "0",
            }))
          );
          for (const g of group) await adjustBalance(tx, g.itemId, g.locationId, g.diff);
          codes.push(code);
        }

        await tx
          .update(inventoryCounts)
          .set({ status: "concluido", finishedAt: new Date() })
          .where(eq(inventoryCounts.id, id));
        return { ok: true, adjusted: adjs.length, movements: codes };
      }

      if (action === "cancel") {
        if (count.status === "concluido") throw new StockError("Inventário concluído não pode ser cancelado.");
        await tx.delete(inventoryCountItems).where(eq(inventoryCountItems.countId, id));
        await tx.update(inventoryCounts).set({ status: "aberto" }).where(eq(inventoryCounts.id, id));
        return { ok: true };
      }

      throw new StockError("Ação inválida.");
    });

    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e, "Erro ao processar inventário.");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  await db.delete(inventoryCounts).where(eq(inventoryCounts.id, id));
  return NextResponse.json({ ok: true });
}
