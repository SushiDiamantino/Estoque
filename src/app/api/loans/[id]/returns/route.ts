import { NextResponse } from "next/server";
import { db } from "@/db";
import { loans, loanReturns, loanReturnItems, partners } from "@/db/schema";
import { eq } from "drizzle-orm";
import { errorResponse, isUuid, parseDay } from "@/lib/stock";
import {
  addLoanEvent,
  assert,
  createLoanMovement,
  getLoanDetail,
  loanItemBalances,
  OPEN_STATUSES,
  q3,
  recomputeLoanStatus,
  type LoanDirection,
  type LoanStatus,
  type ReturnKind,
} from "@/lib/loans";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Registra devolução (física → mexe no saldo) ou baixa (acerto sem retorno físico → só quita a pendência).
 * body: { kind, returnDate, responsible, notes, lines: [{ loanItemId, quantity }] }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    assert(body, "Requisição inválida");
    const kind = body.kind as ReturnKind;
    assert(kind === "devolucao" || kind === "baixa", "Tipo de acerto inválido.");
    const returnDate = typeof body.returnDate === "string" && DAY_RE.test(body.returnDate) ? body.returnDate : todayIso();
    assert(returnDate <= todayIso(), "A data não pode ser futura.");
    const responsible = typeof body.responsible === "string" && body.responsible.trim() ? body.responsible.trim().slice(0, 80) : "Operador de Estoque";
    const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 500) : null;
    if (kind === "baixa") assert(notes && notes.length >= 3, "Acerto sem retorno físico exige justificativa (ex.: pago em dinheiro, reposto por outro item, perdoado).");

    const rawLines = Array.isArray(body.lines) ? (body.lines as { loanItemId?: unknown; quantity?: unknown }[]) : [];
    const wanted = rawLines
      .map((l) => ({ loanItemId: String(l.loanItemId ?? ""), quantity: q3(Number(l.quantity)) }))
      .filter((l) => l.quantity > 0);
    assert(wanted.length > 0, "Informe ao menos uma quantidade maior que zero.");
    const dup = new Set<string>();
    for (const w of wanted) {
      assert(isUuid(w.loanItemId), "Linha inválida.");
      assert(!dup.has(w.loanItemId), "Linha repetida.");
      dup.add(w.loanItemId);
    }

    const result = await db.transaction(async (tx) => {
      const [loan] = await tx.select().from(loans).where(eq(loans.id, id)).for("update");
      assert(loan, "Empréstimo não encontrado.");
      assert(OPEN_STATUSES.includes(loan.status as LoanStatus), `Empréstimo ${loan.status} não aceita devoluções.`);
      assert(returnDate >= loan.loanDate, `A data não pode ser anterior ao empréstimo (${loan.loanDate.split("-").reverse().join("/")}).`);
      const [partner] = await tx.select().from(partners).where(eq(partners.id, loan.partnerId));

      const balances = await loanItemBalances(tx, id, loan.locationId);
      const lines = wanted.map((w) => {
        const b = balances.find((x) => x.id === w.loanItemId);
        assert(b, "Item não pertence a este empréstimo.");
        assert(
          w.quantity <= b.outstandingQty + 0.0005,
          `"${b.itemName}": quantidade ${w.quantity.toLocaleString("pt-BR")} excede o pendente de ${b.outstandingQty.toLocaleString("pt-BR")} ${b.unit}.`
        );
        return { ...w, quantity: Math.min(w.quantity, b.outstandingQty), bal: b };
      });

      let movementCode: string | null = null;
      let movementId: string | null = null;
      if (kind === "devolucao") {
        const mov = await createLoanMovement(tx, {
          loanId: id,
          code: loan.code,
          direction: loan.direction as LoanDirection,
          phase: "return",
          locationId: loan.locationId,
          partnerName: partner?.name ?? "parceiro",
          responsible,
          date: parseDay(returnDate),
          notes,
          lines: lines.map((l) => ({
            itemId: l.bal.itemId,
            quantity: l.quantity,
            unitCost: l.bal.unitCost,
            lotCode: l.bal.lotCode,
          })),
        });
        movementCode = mov.code;
        movementId = mov.id;
      }

      const [ret] = await tx
        .insert(loanReturns)
        .values({ loanId: id, kind, movementId, returnDate, responsible, notes })
        .returning();
      for (const l of lines) {
        await tx.insert(loanReturnItems).values({ returnId: ret.id, loanItemId: l.loanItemId, quantity: String(l.quantity) });
      }

      const status = await recomputeLoanStatus(tx, id);
      const summary = lines.map((l) => `${l.quantity.toLocaleString("pt-BR")} ${l.bal.unit} ${l.bal.itemName}`).join(", ");
      const value = lines.reduce((a, l) => a + l.quantity * l.bal.unitCost, 0);
      await addLoanEvent(
        tx,
        id,
        kind,
        kind === "devolucao"
          ? `Devolução física: ${summary} (R$ ${value.toFixed(2)}) · movimentação ${movementCode}${notes ? ` — ${notes}` : ""}`
          : `Acerto sem retorno físico: ${summary} (R$ ${value.toFixed(2)}) — ${notes}`
      );
      if (status === "quitado") await addLoanEvent(tx, id, "quitado", "Pendência zerada — empréstimo quitado.");
      return { status, movementCode };
    });

    const detail = await getLoanDetail(id);
    return NextResponse.json({ ...detail, result }, { status: 201 });
  } catch (e) {
    return errorResponse(e, "Erro ao registrar devolução");
  }
}
