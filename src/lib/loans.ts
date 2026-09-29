import { db } from "@/db";
import {
  loans,
  loanItems,
  loanReturns,
  loanReturnItems,
  loanEvents,
  movements,
  movementItems,
  partners,
  storageLocations,
  stockBalances,
  items,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  StockError,
  applyDeltas,
  computeDeltas,
  nextMovementCode,
  type Tx,
} from "@/lib/stock";

export type LoanDirection = "pegamos" | "emprestamos";
export type LoanStatus = "aberto" | "parcial" | "quitado" | "cancelado";
export type ReturnKind = "devolucao" | "baixa";

export const OPEN_STATUSES: LoanStatus[] = ["aberto", "parcial"];
const EPS = 0.0005; // metade da menor unidade (3 casas)

/** Arredonda para 3 casas — evita 0.1+0.2 virar pendência fantasma. */
export const q3 = (n: number) => Math.round(n * 1000) / 1000;
export const money = (n: number) => Math.round(n * 100) / 100;

export const DIRECTION_LABEL: Record<LoanDirection, string> = {
  pegamos: "Pegamos emprestado",
  emprestamos: "Emprestamos",
};

/**
 * Efeito no saldo por fase:
 *  - abertura: pegamos → entrada (recebemos), emprestamos → saída (cedemos)
 *  - devolução: o inverso da abertura
 */
export function movementTypeFor(direction: LoanDirection, phase: "open" | "return") {
  const opensWithEntry = direction === "pegamos";
  const entry = phase === "open" ? opensWithEntry : !opensWithEntry;
  return entry ? ("entrada" as const) : ("saida" as const);
}

export function movementReason(direction: LoanDirection, phase: "open" | "return", partner: string) {
  if (phase === "open") {
    return direction === "pegamos"
      ? `Empréstimo recebido — ${partner}`
      : `Empréstimo concedido — ${partner}`;
  }
  return direction === "pegamos"
    ? `Devolução de empréstimo — ${partner}`
    : `Retorno de empréstimo — ${partner}`;
}

type Line = { itemId: string; quantity: number; unitCost: number; lotCode?: string | null };

/**
 * Cria a movimentação confirmada vinculada ao empréstimo e aplica no saldo.
 * Lança StockError se faltar saldo (saída) — a transação inteira é revertida.
 */
export async function createLoanMovement(
  tx: Tx,
  args: {
    loanId: string;
    code: string;
    direction: LoanDirection;
    phase: "open" | "return";
    locationId: string;
    partnerName: string;
    responsible: string | null;
    date: Date;
    notes?: string | null;
    lines: Line[];
  }
) {
  const type = movementTypeFor(args.direction, args.phase);
  const movCode = await nextMovementCode(tx, type);
  const totalCost = money(args.lines.reduce((a, l) => a + l.quantity * l.unitCost, 0));

  const [mov] = await tx
    .insert(movements)
    .values({
      code: movCode,
      type,
      status: "confirmada",
      supplier: type === "entrada" ? args.partnerName : null,
      responsible: args.responsible,
      reason: movementReason(args.direction, args.phase, args.partnerName),
      notes: args.notes ? `${args.code} · ${args.notes}` : args.code,
      sourceLocationId: type === "saida" ? args.locationId : null,
      destLocationId: type === "entrada" ? args.locationId : null,
      totalCost: String(totalCost),
      movementDate: args.date,
      confirmedAt: new Date(),
      loanId: args.loanId,
    })
    .returning();

  for (const l of args.lines) {
    await tx.insert(movementItems).values({
      movementId: mov.id,
      itemId: l.itemId,
      quantity: String(q3(l.quantity)),
      unitCost: String(money(l.unitCost)),
      lotCode: l.lotCode ?? null,
    });
  }

  const deltas = computeDeltas(
    { type, sourceLocationId: mov.sourceLocationId, destLocationId: mov.destLocationId },
    args.lines,
    1
  );
  await applyDeltas(tx, deltas);
  return mov;
}

/** Reverte a movimentação de abertura (cancelamento) — marca estornada e desfaz os saldos. */
export async function reverseLoanMovement(tx: Tx, movementId: string) {
  const [mov] = await tx.select().from(movements).where(eq(movements.id, movementId)).for("update");
  if (!mov || mov.status !== "confirmada") return;
  const lines = await tx
    .select({ itemId: movementItems.itemId, quantity: movementItems.quantity })
    .from(movementItems)
    .where(eq(movementItems.movementId, movementId));
  const deltas = computeDeltas(
    { type: mov.type, sourceLocationId: mov.sourceLocationId, destLocationId: mov.destLocationId },
    lines,
    -1
  );
  await applyDeltas(tx, deltas);
  await tx
    .update(movements)
    .set({ status: "estornada", updatedAt: new Date() })
    .where(eq(movements.id, movementId));
}

export type LoanItemBalance = {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string;
  unit: string;
  quantity: number;
  unitCost: number;
  lotCode: string | null;
  returnedQty: number;
  settledQty: number;
  outstandingQty: number;
  outstandingValue: number;
  /** saldo atual do item no local do empréstimo (importa para conseguir devolver) */
  available: number;
};

/** Saldo por linha: quantidade − devolvido − baixado = pendente. */
export async function loanItemBalances(exec: Tx | typeof db, loanId: string, locationId: string) {
  const rows = await exec
    .select({
      id: loanItems.id,
      itemId: loanItems.itemId,
      itemName: items.name,
      itemSku: items.sku,
      unit: items.unit,
      quantity: loanItems.quantity,
      unitCost: loanItems.unitCost,
      lotCode: loanItems.lotCode,
      returnedQty: sql<string>`coalesce((select sum(lri.quantity::numeric) from loan_return_items lri join loan_returns lr on lr.id = lri.return_id where lri.loan_item_id = ${loanItems.id} and lr.kind = 'devolucao'), 0)`,
      settledQty: sql<string>`coalesce((select sum(lri.quantity::numeric) from loan_return_items lri join loan_returns lr on lr.id = lri.return_id where lri.loan_item_id = ${loanItems.id} and lr.kind = 'baixa'), 0)`,
      available: sql<string>`coalesce((select sb.quantity::numeric from stock_balances sb where sb.item_id = ${loanItems.itemId} and sb.location_id = ${locationId}::uuid), 0)`,
    })
    .from(loanItems)
    .innerJoin(items, eq(loanItems.itemId, items.id))
    .where(eq(loanItems.loanId, loanId))
    .orderBy(items.name);

  return rows.map<LoanItemBalance>((r) => {
    const quantity = Number(r.quantity);
    const returnedQty = Number(r.returnedQty);
    const settledQty = Number(r.settledQty);
    const outstandingQty = Math.max(0, q3(quantity - returnedQty - settledQty));
    return {
      id: r.id,
      itemId: r.itemId,
      itemName: r.itemName,
      itemSku: r.itemSku,
      unit: r.unit,
      quantity,
      unitCost: Number(r.unitCost),
      lotCode: r.lotCode,
      returnedQty,
      settledQty,
      outstandingQty,
      outstandingValue: money(outstandingQty * Number(r.unitCost)),
      available: Number(r.available),
    };
  });
}

/** Recalcula o status a partir do saldo pendente. Retorna o status resultante. */
export async function recomputeLoanStatus(tx: Tx, loanId: string): Promise<LoanStatus> {
  const [loan] = await tx.select().from(loans).where(eq(loans.id, loanId));
  if (!loan || loan.status === "cancelado") return "cancelado";
  const balances = await loanItemBalances(tx, loanId, loan.locationId);
  const outstanding = balances.reduce((a, b) => a + b.outstandingQty, 0);
  const anyMovement = balances.some((b) => b.returnedQty > EPS || b.settledQty > EPS);
  const status: LoanStatus = outstanding <= EPS ? "quitado" : anyMovement ? "parcial" : "aberto";
  await tx
    .update(loans)
    .set({
      status,
      settledAt: status === "quitado" ? (loan.settledAt ?? new Date()) : null,
      updatedAt: new Date(),
    })
    .where(eq(loans.id, loanId));
  return status;
}

export async function addLoanEvent(tx: Tx, loanId: string, type: string, description: string) {
  await tx.insert(loanEvents).values({ loanId, type, description });
}

export async function getLoanDetail(id: string) {
  const [row] = await db
    .select({
      loan: loans,
      partnerName: partners.name,
      partnerContact: partners.contact,
      partnerPhone: partners.phone,
      locationName: storageLocations.name,
    })
    .from(loans)
    .innerJoin(partners, eq(loans.partnerId, partners.id))
    .innerJoin(storageLocations, eq(loans.locationId, storageLocations.id))
    .where(eq(loans.id, id));
  if (!row) return null;

  const [itemsBal, returns, events, openMov] = await Promise.all([
    loanItemBalances(db, id, row.loan.locationId),
    db
      .select({
        id: loanReturns.id,
        kind: loanReturns.kind,
        returnDate: loanReturns.returnDate,
        responsible: loanReturns.responsible,
        notes: loanReturns.notes,
        createdAt: loanReturns.createdAt,
        movementCode: movements.code,
      })
      .from(loanReturns)
      .leftJoin(movements, eq(loanReturns.movementId, movements.id))
      .where(eq(loanReturns.loanId, id))
      .orderBy(loanReturns.createdAt),
    db.select().from(loanEvents).where(eq(loanEvents.loanId, id)).orderBy(loanEvents.createdAt),
    db
      .select({ code: movements.code, status: movements.status })
      .from(movements)
      .where(and(eq(movements.loanId, id), sql`${movements.reason} like 'Empréstimo %'`))
      .limit(1),
  ]);

  const returnItems =
    returns.length > 0
      ? await db
          .select({
            returnId: loanReturnItems.returnId,
            loanItemId: loanReturnItems.loanItemId,
            quantity: loanReturnItems.quantity,
          })
          .from(loanReturnItems)
          .where(
            sql`${loanReturnItems.returnId} in (select id from loan_returns where loan_id = ${id}::uuid)`
          )
      : [];

  const totals = itemsBal.reduce(
    (a, b) => ({
      quantity: q3(a.quantity + b.quantity),
      value: money(a.value + b.quantity * b.unitCost),
      outstandingQty: q3(a.outstandingQty + b.outstandingQty),
      outstandingValue: money(a.outstandingValue + b.outstandingValue),
    }),
    { quantity: 0, value: 0, outstandingQty: 0, outstandingValue: 0 }
  );

  return {
    loan: {
      ...row.loan,
      partnerName: row.partnerName,
      partnerContact: row.partnerContact,
      partnerPhone: row.partnerPhone,
      locationName: row.locationName,
      daysLeft: daysUntil(row.loan.dueDate),
      openingMovement: openMov[0] ?? null,
    },
    items: itemsBal,
    returns: returns.map((r) => ({
      ...r,
      items: returnItems
        .filter((ri) => ri.returnId === r.id)
        .map((ri) => ({
          loanItemId: ri.loanItemId,
          quantity: Number(ri.quantity),
          itemName: itemsBal.find((b) => b.id === ri.loanItemId)?.itemName ?? "—",
          unit: itemsBal.find((b) => b.id === ri.loanItemId)?.unit ?? "",
        })),
    })),
    events,
    totals,
  };
}

/** Dias até o vencimento (negativo = atrasado), comparando só a data local. */
export function daysUntil(dueDate: string): number {
  const [y, m, d] = dueDate.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new StockError(msg);
}

/** Garante que o saldo atual do item no local cobre uma quantidade (sem alterar nada). */
export async function assertAvailable(tx: Tx, itemId: string, locationId: string, qty: number, label: string) {
  const [bal] = await tx
    .select({ quantity: stockBalances.quantity })
    .from(stockBalances)
    .where(and(eq(stockBalances.itemId, itemId), eq(stockBalances.locationId, locationId)));
  const available = Number(bal?.quantity ?? 0);
  assert(available + EPS >= qty, `Saldo insuficiente de "${label}" no local: disponível ${available.toLocaleString("pt-BR")}, necessário ${qty.toLocaleString("pt-BR")}.`);
}
