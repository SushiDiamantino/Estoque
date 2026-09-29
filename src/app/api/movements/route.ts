import { NextResponse } from "next/server";
import { db } from "@/db";
import { movements, movementItems, items } from "@/db/schema";
import { eq, sql, ilike, or, desc, and, inArray, type SQL } from "drizzle-orm";
import {
  applyDeltas,
  computeDeltas,
  errorResponse,
  isUuid,
  nextMovementCode,
  parseDay,
  StockError,
} from "@/lib/stock";

type MType = "entrada" | "saida" | "transferencia";
type MStatus = "rascunho" | "confirmada" | "estornada";

const CONSUMO_REASONS = ["Consumo — cozinha", "Consumo — delivery", "Uso operacional"];
const PERDA_REASONS = ["Perda / quebra", "Vencimento", "Avaria"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "all";
  const status = searchParams.get("status") ?? "all";
  const q = searchParams.get("q")?.trim() ?? "";
  const location = searchParams.get("location") ?? "all";
  const reason = searchParams.get("reason") ?? "all";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const typeCond =
    type !== "all" && ["entrada", "saida", "transferencia"].includes(type)
      ? eq(movements.type, type as MType)
      : undefined;

  const conds: SQL[] = [];
  if (typeCond) conds.push(typeCond);
  if (["rascunho", "confirmada", "estornada"].includes(status)) {
    conds.push(eq(movements.status, status as MStatus));
  }
  if (q) {
    const c = or(
      ilike(movements.code, `%${q}%`),
      ilike(movements.supplier, `%${q}%`),
      ilike(movements.invoiceNumber, `%${q}%`),
      ilike(movements.responsible, `%${q}%`)
    );
    if (c) conds.push(c);
  }
  if (isUuid(location)) {
    const c = or(
      eq(movements.sourceLocationId, location),
      eq(movements.destLocationId, location)
    );
    if (c) conds.push(c);
  }
  if (reason === "consumo") conds.push(inArray(movements.reason, CONSUMO_REASONS));
  else if (reason === "perdas") conds.push(inArray(movements.reason, PERDA_REASONS));
  else if (reason !== "all" && reason) conds.push(eq(movements.reason, reason));
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    conds.push(sql`(${movements.movementDate} at time zone 'America/Sao_Paulo')::date >= ${from}::date`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    conds.push(sql`(${movements.movementDate} at time zone 'America/Sao_Paulo')::date <= ${to}::date`);
  }

  const rows = await db
    .select({
      id: movements.id,
      code: movements.code,
      type: movements.type,
      status: movements.status,
      supplier: movements.supplier,
      invoiceNumber: movements.invoiceNumber,
      responsible: movements.responsible,
      reason: movements.reason,
      notes: movements.notes,
      sourceLocationId: movements.sourceLocationId,
      destLocationId: movements.destLocationId,
      totalCost: movements.totalCost,
      movementDate: movements.movementDate,
      confirmedAt: movements.confirmedAt,
      createdAt: movements.createdAt,
      itemCount: sql<number>`(select count(*)::int from movement_items where movement_items.movement_id = "movements"."id")`,
      totalQty: sql<number>`coalesce((select sum(movement_items.quantity::numeric) from movement_items where movement_items.movement_id = "movements"."id"), 0)`,
      sourceLocationName: sql<string | null>`(select name from storage_locations sl where sl.id = "movements"."source_location_id")`,
      destLocationName: sql<string | null>`(select name from storage_locations sl where sl.id = "movements"."dest_location_id")`,
    })
    .from(movements)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(movements.movementDate), desc(movements.createdAt))
    .limit(500);

  const [s] = await db
    .select({
      total: sql<number>`count(*)::int`,
      confirmed: sql<number>`count(*) filter (where ${movements.status} = 'confirmada')::int`,
      draft: sql<number>`count(*) filter (where ${movements.status} = 'rascunho')::int`,
      reversed: sql<number>`count(*) filter (where ${movements.status} = 'estornada')::int`,
      consumo: sql<number>`count(*) filter (where ${movements.status} = 'confirmada' and ${inArray(movements.reason, CONSUMO_REASONS)})::int`,
      perdas: sql<number>`count(*) filter (where ${movements.status} = 'confirmada' and ${inArray(movements.reason, PERDA_REASONS)})::int`,
    })
    .from(movements)
    .where(typeCond);

  return NextResponse.json({
    movements: rows,
    stats: {
      total: s?.total ?? 0,
      confirmed: s?.confirmed ?? 0,
      draft: s?.draft ?? 0,
      reversed: s?.reversed ?? 0,
      consumo: s?.consumo ?? 0,
      perdas: s?.perdas ?? 0,
    },
  });
}

type LineInput = {
  itemId: string;
  quantity: number;
  unitCost?: number;
  lotCode?: string;
  expiryDate?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      type: MType;
      status?: "rascunho" | "confirmada";
      supplier?: string;
      invoiceNumber?: string;
      responsible?: string;
      reason?: string;
      notes?: string;
      sourceLocationId?: string | null;
      destLocationId?: string | null;
      movementDate?: string;
      items: LineInput[];
    };
    const { type } = body;

    if (!type || !["entrada", "saida", "transferencia"].includes(type)) {
      throw new StockError("Tipo de movimentação inválido.");
    }
    const source = isUuid(body.sourceLocationId) ? body.sourceLocationId : null;
    const dest = isUuid(body.destLocationId) ? body.destLocationId : null;
    if (type === "entrada" && !dest) throw new StockError("Local de destino é obrigatório.");
    if (type === "saida" && !source) throw new StockError("Local de origem é obrigatório.");
    if (type === "transferencia") {
      if (!source || !dest) throw new StockError("Origem e destino são obrigatórios.");
      if (source === dest) throw new StockError("Origem e destino devem ser diferentes.");
    }
    if (type === "saida" && !body.reason?.trim()) {
      throw new StockError("Informe o motivo da saída.");
    }

    const lines = (body.items ?? []).filter(
      (l) => isUuid(l.itemId) && Number(l.quantity) > 0
    );
    if (lines.length === 0) throw new StockError("Adicione ao menos um item com quantidade.");
    if (lines.length > 200) throw new StockError("Máximo de 200 linhas por movimentação.");

    const itemIds = [...new Set(lines.map((l) => l.itemId))];
    const found = await db
      .select({ id: items.id, name: items.name, lotControl: items.lotControl, expiryControl: items.expiryControl })
      .from(items)
      .where(inArray(items.id, itemIds));
    if (found.length !== itemIds.length) throw new StockError("Um ou mais itens não foram encontrados.");

    const confirm = body.status === "confirmada";
    if (confirm && type === "entrada") {
      const map = new Map(found.map((f) => [f.id, f]));
      for (const l of lines) {
        const it = map.get(l.itemId);
        if (it?.lotControl && !l.lotCode?.trim()) {
          throw new StockError(`"${it.name}" exige número de lote.`);
        }
        if (it?.expiryControl && !l.expiryDate) {
          throw new StockError(`"${it.name}" exige data de validade.`);
        }
      }
    }

    const totalCost = lines.reduce(
      (acc, l) => acc + Number(l.quantity) * Number(l.unitCost ?? 0),
      0
    );

    const mov = await db.transaction(async (tx) => {
      const code = await nextMovementCode(tx, type);
      const [m] = await tx
        .insert(movements)
        .values({
          code,
          type,
          status: confirm ? "confirmada" : "rascunho",
          supplier: body.supplier?.trim() || null,
          invoiceNumber: body.invoiceNumber?.trim() || null,
          responsible: body.responsible?.trim() || null,
          reason: body.reason?.trim() || null,
          notes: body.notes?.trim() || null,
          sourceLocationId: type === "entrada" ? null : source,
          destLocationId: type === "saida" ? null : dest,
          totalCost: totalCost.toFixed(2),
          movementDate: parseDay(body.movementDate),
          confirmedAt: confirm ? new Date() : null,
        })
        .returning();

      await tx.insert(movementItems).values(
        lines.map((l) => ({
          movementId: m.id,
          itemId: l.itemId,
          quantity: String(Number(l.quantity)),
          unitCost: String(Number(l.unitCost ?? 0)),
          lotCode: l.lotCode?.trim() || null,
          expiryDate: /^\d{4}-\d{2}-\d{2}$/.test(l.expiryDate ?? "") ? l.expiryDate! : null,
        }))
      );

      if (confirm) {
        await applyDeltas(tx, computeDeltas(m, lines, 1));
      }
      return m;
    });

    return NextResponse.json({ movement: mov }, { status: 201 });
  } catch (e) {
    return errorResponse(e, "Erro ao registrar movimentação.");
  }
}
