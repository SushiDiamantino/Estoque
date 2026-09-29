import { db } from "@/db";
import { inventoryCounts, items, loans, movements, stockBalances } from "@/db/schema";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type MovementType = "entrada" | "saida" | "transferencia";

export class StockError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** Erro de chave única do PostgreSQL (23505). */
export function isUniqueViolation(e: unknown): boolean {
  // o Drizzle embrulha o erro do driver; o código do PostgreSQL fica em `cause`
  let cur: unknown = e;
  for (let depth = 0; depth < 4 && typeof cur === "object" && cur !== null; depth++) {
    if ((cur as { code?: unknown }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/** Lista de strings para usar em `in (...)` dentro de sql cru. */
export function sqlList(values: readonly string[]) {
  return sql.join(values.map((v) => sql`${v}`), sql`, `);
}

/** "2026-01-05" -> meio-dia local, evita o dia "voltar" por fuso horário. */
export function parseDay(value?: string | null): Date {
  if (!value) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Próximo código sequencial "PREFIXO-ANO-NNNN".
 * Usa o maior sufixo existente (não a contagem), então rascunhos excluídos
 * não causam repetição, e um advisory lock serializa geração concorrente.
 */
async function nextCode(
  tx: Tx,
  table: PgTable,
  column: PgColumn,
  prefix: string,
  pad: number
): Promise<string> {
  const base = `${prefix}-${new Date().getFullYear()}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${base}::text))`);
  const [row] = await tx
    .select({
      max: sql<number>`coalesce(max((substring(${column} from '([0-9]+)$'))::int), 0)`,
    })
    .from(table)
    .where(like(column, `${base}-%`));
  return `${base}-${String(Number(row?.max ?? 0) + 1).padStart(pad, "0")}`;
}

export function nextMovementCode(tx: Tx, type: MovementType) {
  const prefix = type === "entrada" ? "ENT" : type === "saida" ? "SAI" : "TRF";
  return nextCode(tx, movements, movements.code, prefix, 4);
}

export function nextLoanCode(tx: Tx) {
  return nextCode(tx, loans, loans.code, "EMP", 4);
}

export function nextInventoryCode(tx: Tx) {
  return nextCode(tx, inventoryCounts, inventoryCounts.code, "INV", 3);
}

type MovLike = {
  type: MovementType;
  sourceLocationId: string | null;
  destLocationId: string | null;
};
type LineLike = { itemId: string; quantity: string | number };

/** Variação de saldo por (item, local). sign = 1 aplica, -1 estorna. */
export function computeDeltas(mov: MovLike, lines: LineLike[], sign: 1 | -1) {
  const deltas = new Map<string, { itemId: string; locationId: string; delta: number }>();
  const add = (itemId: string, locationId: string | null, delta: number) => {
    if (!locationId) return;
    const key = `${itemId}|${locationId}`;
    const cur = deltas.get(key);
    if (cur) cur.delta += delta;
    else deltas.set(key, { itemId, locationId, delta });
  };
  for (const l of lines) {
    const q = Number(l.quantity) * sign;
    if (mov.type === "entrada") add(l.itemId, mov.destLocationId, q);
    else if (mov.type === "saida") add(l.itemId, mov.sourceLocationId, -q);
    else {
      add(l.itemId, mov.sourceLocationId, -q);
      add(l.itemId, mov.destLocationId, q);
    }
  }
  return [...deltas.values()].filter((d) => Math.abs(d.delta) > 1e-9);
}

/** Valida (com trava de linha) e aplica as variações. Lança StockError se faltar saldo. */
export async function applyDeltas(
  tx: Tx,
  deltas: { itemId: string; locationId: string; delta: number }[]
) {
  const negatives = deltas.filter((d) => d.delta < 0);
  if (negatives.length) {
    const itemIds = [...new Set(negatives.map((d) => d.itemId))];
    const names = await tx
      .select({ id: items.id, name: items.name, unit: items.unit })
      .from(items)
      .where(inArray(items.id, itemIds));
    const nameMap = new Map(names.map((n) => [n.id, n]));

    for (const d of negatives) {
      const [bal] = await tx
        .select({ quantity: stockBalances.quantity })
        .from(stockBalances)
        .where(
          and(
            eq(stockBalances.itemId, d.itemId),
            eq(stockBalances.locationId, d.locationId)
          )
        )
        .for("update");
      const available = Number(bal?.quantity ?? 0);
      if (available + d.delta < -1e-9) {
        const it = nameMap.get(d.itemId);
        throw new StockError(
          `Saldo insuficiente de "${it?.name ?? "item"}": disponível ${available.toLocaleString("pt-BR")} ${it?.unit ?? ""}, necessário ${Math.abs(d.delta).toLocaleString("pt-BR")}.`
        );
      }
    }
  }

  for (const d of deltas) {
    await adjustBalance(tx, d.itemId, d.locationId, d.delta);
  }
}

export async function adjustBalance(
  tx: Tx,
  itemId: string,
  locationId: string,
  delta: number
) {
  await tx
    .insert(stockBalances)
    .values({ itemId, locationId, quantity: String(delta) })
    .onConflictDoUpdate({
      target: [stockBalances.itemId, stockBalances.locationId],
      set: {
        quantity: sql`"stock_balances"."quantity" + ${String(delta)}::numeric`,
        updatedAt: new Date(),
      },
    });
}

export function errorResponse(e: unknown, fallback: string) {
  if (e instanceof StockError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  console.error(e);
  return Response.json({ error: fallback }, { status: 500 });
}
