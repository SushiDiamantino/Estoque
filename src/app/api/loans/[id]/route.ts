import { NextResponse } from "next/server";
import { db } from "@/db";
import { loans, loanReturns, movements } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { StockError, errorResponse, isUuid } from "@/lib/stock";
import {
  addLoanEvent,
  assert,
  getLoanDetail,
  OPEN_STATUSES,
  reverseLoanMovement,
  type LoanStatus,
} from "@/lib/loans";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const br = (d: string) => d.split("-").reverse().join("/");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const detail = await getLoanDetail(id);
  if (!detail) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(detail);
}

/**
 * Ações:
 *  - extend  { dueDate, reason }  → prorroga o prazo (exige justificativa)
 *  - cancel  { reason }           → cancela e desfaz o saldo (só sem devoluções)
 *  - notes   { notes }            → atualiza observações
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    assert(body, "Requisição inválida");
    const action = body.action;

    await db.transaction(async (tx) => {
      const [loan] = await tx.select().from(loans).where(eq(loans.id, id)).for("update");
      assert(loan, "Empréstimo não encontrado.");

      if (action === "extend") {
        assert(OPEN_STATUSES.includes(loan.status as LoanStatus), "Só é possível prorrogar empréstimos em aberto.");
        const dueDate = typeof body.dueDate === "string" && DAY_RE.test(body.dueDate) ? body.dueDate : "";
        const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
        assert(dueDate, "Informe o novo prazo.");
        assert(dueDate > loan.dueDate, `O novo prazo deve ser posterior a ${br(loan.dueDate)}.`);
        assert(reason.length >= 3, "Justifique a prorrogação (mín. 3 caracteres).");
        assert(loan.extensions < 5, "Limite de 5 prorrogações atingido. Registre um acerto ou cobre a devolução.");
        await tx
          .update(loans)
          .set({ dueDate, extensions: loan.extensions + 1, updatedAt: new Date() })
          .where(eq(loans.id, id));
        await addLoanEvent(tx, id, "prorrogado", `Prazo prorrogado de ${br(loan.dueDate)} para ${br(dueDate)} (${loan.extensions + 1}ª vez) — ${reason}`);
        return;
      }

      if (action === "cancel") {
        assert(OPEN_STATUSES.includes(loan.status as LoanStatus), "Só é possível cancelar empréstimos em aberto.");
        const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
        assert(reason.length >= 3, "Justifique o cancelamento (mín. 3 caracteres).");
        const [ret] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(loanReturns)
          .where(eq(loanReturns.loanId, id));
        assert((ret?.count ?? 0) === 0, "Empréstimo já teve devolução/acerto e não pode ser cancelado. Quite o restante por devolução ou baixa.");

        const opening = await tx
          .select({ id: movements.id, code: movements.code })
          .from(movements)
          .where(and(eq(movements.loanId, id), eq(movements.status, "confirmada")));
        for (const m of opening) await reverseLoanMovement(tx, m.id); // lança StockError se o saldo já foi consumido

        await tx
          .update(loans)
          .set({ status: "cancelado", cancelReason: reason, updatedAt: new Date() })
          .where(eq(loans.id, id));
        await addLoanEvent(tx, id, "cancelado", `Cancelado — ${reason}. Saldo revertido (${opening.map((m) => m.code).join(", ") || "sem movimentação"}).`);
        return;
      }

      if (action === "notes") {
        const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "";
        await tx.update(loans).set({ notes: notes || null, updatedAt: new Date() }).where(eq(loans.id, id));
        await addLoanEvent(tx, id, "observacao", notes ? `Observação atualizada: ${notes}` : "Observação removida");
        return;
      }

      throw new StockError("Ação inválida.");
    });

    const detail = await getLoanDetail(id);
    return NextResponse.json(detail);
  } catch (e) {
    return errorResponse(e, "Erro ao atualizar empréstimo");
  }
}
