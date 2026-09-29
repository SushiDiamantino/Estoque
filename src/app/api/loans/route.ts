import { NextResponse } from "next/server";
import { db } from "@/db";
import { items, loans, loanItems, partners, storageLocations } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { getSettings } from "@/lib/settings";
import {
  StockError,
  errorResponse,
  isUuid,
  nextLoanCode,
  parseDay,
} from "@/lib/stock";
import {
  addLoanEvent,
  assert,
  createLoanMovement,
  DIRECTION_LABEL,
  q3,
  type LoanDirection,
} from "@/lib/loans";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "all"; // all | open | overdue | aberto | parcial | quitado | cancelado
  const direction = searchParams.get("direction") ?? "all";
  const partner = searchParams.get("partner") ?? "all";
  const q = searchParams.get("q")?.trim() ?? "";
  const s = await getSettings();

  const conds = [sql`true`];
  if (status === "open") conds.push(sql`l.status in ('aberto', 'parcial')`);
  else if (status === "overdue") conds.push(sql`l.status in ('aberto', 'parcial') and l.due_date < current_date`);
  else if (["aberto", "parcial", "quitado", "cancelado"].includes(status)) conds.push(sql`l.status = ${status}`);
  if (direction === "pegamos" || direction === "emprestamos") conds.push(sql`l.direction = ${direction}`);
  if (partner !== "all" && isUuid(partner)) conds.push(sql`l.partner_id = ${partner}::uuid`);
  if (q) {
    const like = `%${q}%`;
    conds.push(sql`(l.code ilike ${like} or p.name ilike ${like} or l.responsible ilike ${like}
      or exists (select 1 from loan_items li2 join items i2 on i2.id = li2.item_id where li2.loan_id = l.id and i2.name ilike ${like}))`);
  }

  const outstandingExpr = sql`greatest(0, li.quantity::numeric - coalesce((select sum(lri.quantity::numeric) from loan_return_items lri where lri.loan_item_id = li.id), 0))`;

  const res = await db.execute(sql`
    select l.id, l.code, l.direction, l.status, l.responsible, l.notes, l.extensions,
      to_char(l.loan_date, 'YYYY-MM-DD') as "loanDate",
      to_char(l.due_date, 'YYYY-MM-DD') as "dueDate",
      (l.due_date - current_date)::int as "daysLeft",
      l.settled_at as "settledAt", l.created_at as "createdAt",
      p.id as "partnerId", p.name as "partnerName", loc.name as "locationName",
      (select count(*)::int from loan_items li where li.loan_id = l.id) as "itemCount",
      (select coalesce(sum(li.quantity::numeric), 0) from loan_items li where li.loan_id = l.id) as "totalQty",
      (select coalesce(sum(li.quantity::numeric * li.unit_cost::numeric), 0) from loan_items li where li.loan_id = l.id) as "totalValue",
      (select coalesce(sum(${outstandingExpr}), 0) from loan_items li where li.loan_id = l.id) as "outstandingQty",
      (select coalesce(sum(${outstandingExpr} * li.unit_cost::numeric), 0) from loan_items li where li.loan_id = l.id) as "outstandingValue",
      (select string_agg(i.name, ', ' order by i.name) from loan_items li join items i on i.id = li.item_id where li.loan_id = l.id) as "itemsLabel"
    from loans l
    join partners p on p.id = l.partner_id
    join storage_locations loc on loc.id = l.location_id
    where ${sql.join(conds, sql` and `)}
    order by
      case when l.status in ('aberto','parcial') then 0 else 1 end,
      case when l.status in ('aberto','parcial') then l.due_date end asc,
      l.created_at desc
    limit 300
  `);

  const statsRes = await db.execute(sql`
    with pend as (
      select l.id, l.direction, l.due_date,
        coalesce(sum(${outstandingExpr} * li.unit_cost::numeric), 0) as value
      from loans l join loan_items li on li.loan_id = l.id
      where l.status in ('aberto', 'parcial')
      group by l.id
    )
    select
      (select count(*)::int from pend where direction = 'emprestamos') as to_receive_count,
      (select coalesce(sum(value), 0) from pend where direction = 'emprestamos') as to_receive_value,
      (select count(*)::int from pend where direction = 'pegamos') as to_return_count,
      (select coalesce(sum(value), 0) from pend where direction = 'pegamos') as to_return_value,
      (select count(*)::int from pend where due_date < current_date) as overdue,
      (select count(*)::int from pend where due_date >= current_date and due_date <= current_date + (${s.loanDueDays}::int * interval '1 day')) as due_soon,
      (select count(*)::int from loans where status = 'quitado') as settled,
      (select count(*)::int from loans where status = 'cancelado') as cancelled,
      (select count(*)::int from loans) as total,
      (select count(*)::int from partners where active = true) as partners_active
  `);
  const st = (statsRes.rows[0] ?? {}) as Record<string, unknown>;
  const n = (k: string) => Number(st[k] ?? 0);

  return NextResponse.json({
    loans: res.rows,
    stats: {
      toReceiveCount: n("to_receive_count"),
      toReceiveValue: n("to_receive_value"),
      toReturnCount: n("to_return_count"),
      toReturnValue: n("to_return_value"),
      overdue: n("overdue"),
      dueSoon: n("due_soon"),
      settled: n("settled"),
      cancelled: n("cancelled"),
      total: n("total"),
      partnersActive: n("partners_active"),
      loanDueDays: s.loanDueDays,
    },
  });
}

type LineIn = { itemId?: unknown; quantity?: unknown; unitCost?: unknown; lotCode?: unknown };

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    assert(body, "Requisição inválida");

    const direction = body.direction as LoanDirection;
    assert(direction === "pegamos" || direction === "emprestamos", "Informe se pegamos ou emprestamos.");
    assert(isUuid(body.partnerId), "Selecione o restaurante parceiro.");
    assert(isUuid(body.locationId), "Selecione o local de armazenamento.");

    const loanDate = typeof body.loanDate === "string" && DAY_RE.test(body.loanDate) ? body.loanDate : todayIso();
    const dueDate = typeof body.dueDate === "string" && DAY_RE.test(body.dueDate) ? body.dueDate : "";
    assert(dueDate, "Informe o prazo de devolução.");
    assert(dueDate >= loanDate, "O prazo não pode ser anterior à data do empréstimo.");
    assert(loanDate <= todayIso(), "A data do empréstimo não pode ser futura.");

    const rawLines = Array.isArray(body.items) ? (body.items as LineIn[]) : [];
    assert(rawLines.length > 0, "Adicione ao menos um item.");
    const seen = new Set<string>();
    const lines = rawLines.map((l, i) => {
      assert(isUuid(l.itemId), `Linha ${i + 1}: selecione o item.`);
      const quantity = q3(Number(l.quantity));
      assert(Number.isFinite(quantity) && quantity > 0, `Linha ${i + 1}: quantidade deve ser maior que zero.`);
      const unitCost = Number(l.unitCost ?? 0);
      assert(Number.isFinite(unitCost) && unitCost >= 0, `Linha ${i + 1}: custo inválido.`);
      assert(!seen.has(l.itemId), `Linha ${i + 1}: item repetido — some as quantidades em uma linha só.`);
      seen.add(l.itemId);
      return {
        itemId: l.itemId,
        quantity,
        unitCost: Math.round(unitCost * 100) / 100,
        lotCode: typeof l.lotCode === "string" && l.lotCode.trim() ? l.lotCode.trim().slice(0, 60) : null,
      };
    });

    const [partner] = await db.select().from(partners).where(eq(partners.id, body.partnerId as string));
    assert(partner, "Parceiro não encontrado.");
    assert(partner.active, "Parceiro inativo. Reative-o antes de registrar empréstimos.");
    const [location] = await db.select().from(storageLocations).where(eq(storageLocations.id, body.locationId as string));
    assert(location, "Local não encontrado.");
    assert(location.active, "Local inativo.");

    const itemRows = await db
      .select({ id: items.id, name: items.name, active: items.active, costPrice: items.costPrice })
      .from(items)
      .where(inArray(items.id, lines.map((l) => l.itemId)));
    for (const l of lines) {
      const it = itemRows.find((r) => r.id === l.itemId);
      assert(it, "Item não encontrado.");
      assert(it.active, `Item "${it.name}" está inativo.`);
      // custo zero → usa o custo médio cadastrado, para a pendência ter valor
      if (l.unitCost === 0) l.unitCost = Number(it.costPrice ?? 0);
    }

    const responsible = typeof body.responsible === "string" && body.responsible.trim() ? body.responsible.trim().slice(0, 80) : "Operador de Estoque";
    const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 500) : null;

    const created = await db.transaction(async (tx) => {
      const code = await nextLoanCode(tx);
      const [loan] = await tx
        .insert(loans)
        .values({
          code,
          direction,
          status: "aberto",
          partnerId: partner.id,
          locationId: location.id,
          responsible,
          notes,
          loanDate,
          dueDate,
        })
        .returning();

      for (const l of lines) {
        await tx.insert(loanItems).values({
          loanId: loan.id,
          itemId: l.itemId,
          quantity: String(l.quantity),
          unitCost: String(l.unitCost),
          lotCode: l.lotCode,
        });
      }

      const mov = await createLoanMovement(tx, {
        loanId: loan.id,
        code,
        direction,
        phase: "open",
        locationId: location.id,
        partnerName: partner.name,
        responsible,
        date: parseDay(loanDate),
        notes,
        lines,
      });

      const total = lines.reduce((a, l) => a + l.quantity * l.unitCost, 0);
      await addLoanEvent(
        tx,
        loan.id,
        "criado",
        `${DIRECTION_LABEL[direction]} de ${partner.name} · ${lines.length} item(ns) · R$ ${total.toFixed(2)} · prazo ${dueDate.split("-").reverse().join("/")} · movimentação ${mov.code} (${mov.type === "entrada" ? "entrada em" : "saída de"} ${location.name})`
      );
      return { ...loan, movementCode: mov.code };
    });

    return NextResponse.json({ loan: created }, { status: 201 });
  } catch (e) {
    if (e instanceof StockError) return errorResponse(e, "");
    return errorResponse(e, "Erro ao registrar empréstimo");
  }
}
