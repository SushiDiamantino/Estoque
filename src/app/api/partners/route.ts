import { NextResponse } from "next/server";
import { db } from "@/db";
import { partners } from "@/db/schema";
import { sql } from "drizzle-orm";
import { isUniqueViolation } from "@/lib/stock";

const str = (v: unknown, max = 200) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** Parceiros com posição consolidada: quanto nos devem e quanto devemos. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const onlyActive = searchParams.get("status") === "active";

  const res = await db.execute(sql`
    with pend as (
      select l.partner_id, l.direction, l.status, l.due_date,
        coalesce(sum(
          greatest(0, li.quantity::numeric
            - coalesce((select sum(lri.quantity::numeric) from loan_return_items lri where lri.loan_item_id = li.id), 0)
          ) * li.unit_cost::numeric
        ), 0) as outstanding_value
      from loans l
      join loan_items li on li.loan_id = l.id
      where l.status in ('aberto', 'parcial')
      group by l.id, l.partner_id, l.direction, l.status, l.due_date
    )
    select p.*,
      (select count(*)::int from pend where pend.partner_id = p.id) as open_loans,
      (select count(*)::int from pend where pend.partner_id = p.id and pend.due_date < current_date) as overdue_loans,
      (select coalesce(sum(outstanding_value), 0) from pend where pend.partner_id = p.id and pend.direction = 'emprestamos') as to_receive,
      (select coalesce(sum(outstanding_value), 0) from pend where pend.partner_id = p.id and pend.direction = 'pegamos') as to_return,
      (select count(*)::int from loans l where l.partner_id = p.id) as total_loans
    from partners p
    ${onlyActive ? sql`where p.active = true` : sql``}
    order by p.active desc, lower(p.name)
  `);

  return NextResponse.json({ partners: res.rows });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  const name = str(body.name, 120);
  if (!name) return NextResponse.json({ error: "Nome do parceiro é obrigatório" }, { status: 400 });
  try {
    const [row] = await db
      .insert(partners)
      .values({
        name,
        contact: str(body.contact, 120),
        phone: str(body.phone, 40),
        email: str(body.email, 120),
        notes: str(body.notes, 500),
        active: body.active === undefined ? true : Boolean(body.active),
      })
      .returning();
    return NextResponse.json({ partner: row }, { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "Já existe um parceiro com esse nome." }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Erro ao criar parceiro" }, { status: 500 });
  }
}
