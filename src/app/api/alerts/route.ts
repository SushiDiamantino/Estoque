import { NextResponse } from "next/server";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { getSettings } from "@/lib/settings";
import { lotExposure } from "@/lib/lots";

type Severity = "critico" | "atencao" | "informativo";
type AlertDto = {
  id: string;
  key: string;
  severity: Severity;
  title: string;
  message: string;
  kind: string;
  href: string;
};

type LowRow = { id: string; name: string; sku: string; unit: string; min: string; qty: string };
type InvRow = { code: string; status: string; loc: string | null; sched: string | null; late: boolean };

const fmt = (n: unknown) => Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const enc = (s: string) => encodeURIComponent(s);

/** Alertas calculados em tempo real a partir do saldo, respeitando as regras salvas. */
export async function GET() {
  const s = await getSettings();
  // silenciamentos vencidos saem da tabela
  await db.delete(alerts).where(and(eq(alerts.resolved, true), lt(alerts.resolvedAt, new Date())));

  const out: AlertDto[] = [];

  if (s.lowStockNotify) {
    const res = await db.execute(sql`
      select i.id, i.name, i.sku, i.unit, i.min_stock::numeric as min, coalesce(b.qty, 0)::numeric as qty
      from items i
      left join (select item_id, sum(quantity::numeric) as qty from stock_balances group by item_id) b on b.item_id = i.id
      where i.active = true
        and ((i.min_stock::numeric > 0 and coalesce(b.qty, 0) < i.min_stock::numeric)
          or (b.item_id is not null and coalesce(b.qty, 0) <= 0))
      order by (coalesce(b.qty, 0) - i.min_stock::numeric) asc
      limit 50
    `);
    for (const r of res.rows as LowRow[]) {
      const qty = Number(r.qty);
      const min = Number(r.min);
      const href = `/itens?q=${enc(r.name)}`;
      if (qty <= 0) {
        out.push({
          id: "", key: `zero:${r.id}`, severity: "critico", kind: "low-stock", href,
          title: `Estoque zerado · ${r.name}`,
          message: `${r.sku} — sem saldo em nenhum local${min > 0 ? ` · mínimo ${fmt(min)} ${r.unit}` : ""}`,
        });
      } else {
        out.push({
          id: "", key: `low:${r.id}`, severity: qty < min / 2 ? "critico" : "atencao", kind: "low-stock", href,
          title: `Estoque abaixo do mínimo · ${r.name}`,
          message: `${r.sku} — saldo ${fmt(qty)} ${r.unit} · mínimo ${fmt(min)} ${r.unit}`,
        });
      }
    }
  }

  if (s.expiryNotify) {
    const lots = (await lotExposure()).filter((l) => l.days <= s.expiryDays);
    for (const l of lots.slice(0, 50)) {
      const lotTxt = l.lot ? `Lote ${l.lot}` : `Entrada ${l.code}`;
      const qtyTxt = `${fmt(l.inStock)} ${l.unit} em estoque (≈ R$ ${l.value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
      const due = l.expiry.split("-").reverse().join("/");
      if (l.days < 0) {
        out.push({
          id: "", key: `expired:${l.entryId}`, severity: "critico", kind: "expiry", href: "/saidas",
          title: `Lote vencido · ${l.item}`,
          message: `${lotTxt} venceu em ${due} (há ${Math.abs(l.days)} dia(s)) · ${qtyTxt} · registre a baixa por vencimento`,
        });
      } else {
        out.push({
          id: "", key: `exp:${l.entryId}`, severity: "atencao", kind: "expiry", href: `/itens?q=${enc(l.item)}`,
          title: `Validade próxima · ${l.item}`,
          message: `${lotTxt} vence em ${due}${l.days === 0 ? " (hoje)" : ` · ${l.days} dia(s)`} · ${qtyTxt}`,
        });
      }
    }
  }

  const inv = await db.execute(sql`
    select ic.code, ic.status, l.name as loc,
      to_char(ic.scheduled_for at time zone 'America/Sao_Paulo', 'DD/MM') as sched,
      (ic.status = 'aberto' and ic.scheduled_for is not null and ic.scheduled_for < now() - interval '1 day') as late
    from inventory_counts ic
    left join storage_locations l on l.id = ic.location_id
    where ic.status in ('aberto', 'em_contagem')
    order by ic.scheduled_for asc nulls last
    limit 10
  `);
  for (const r of inv.rows as InvRow[]) {
    const scope = r.loc ?? "geral";
    if (r.status === "em_contagem") {
      out.push({
        id: "", key: `inv:${r.code}`, severity: "informativo", kind: "inventory", href: "/inventario",
        title: `Inventário em andamento · ${scope}`,
        message: `${r.code} — conclua a contagem para ajustar o saldo.`,
      });
    } else {
      out.push({
        id: "", key: `inv:${r.code}`, severity: r.late ? "atencao" : "informativo", kind: "inventory", href: "/inventario",
        title: `${r.late ? "Inventário atrasado" : "Inventário agendado"} · ${scope}`,
        message: `${r.code}${r.sched ? ` — previsto para ${r.sched}` : ""}`,
      });
    }
  }

  if (s.loanNotify) {
    type LoanRow = {
      id: string; code: string; direction: "pegamos" | "emprestamos"; partner: string;
      due: string; days_left: number; outstanding_value: string; items_label: string | null;
    };
    const loanRes = await db.execute(sql`
      select l.id, l.code, l.direction, p.name as partner,
        to_char(l.due_date, 'DD/MM') as due, (l.due_date - current_date)::int as days_left,
        coalesce(sum(greatest(0, li.quantity::numeric - coalesce((select sum(lri.quantity::numeric) from loan_return_items lri where lri.loan_item_id = li.id), 0)) * li.unit_cost::numeric), 0) as outstanding_value,
        string_agg(i.name, ', ' order by i.name) as items_label
      from loans l
      join partners p on p.id = l.partner_id
      join loan_items li on li.loan_id = l.id
      join items i on i.id = li.item_id
      where l.status in ('aberto', 'parcial')
        and l.due_date <= current_date + (${s.loanDueDays}::int * interval '1 day')
      group by l.id, p.name
      order by l.due_date asc
      limit 50
    `);
    for (const r of loanRes.rows as LoanRow[]) {
      const val = Number(r.outstanding_value);
      const money = val > 0 ? ` · R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "";
      const pend = `pendente: ${r.items_label ?? "itens"}${money}`;
      const href = `/emprestimos?q=${enc(r.code)}`;
      const late = r.days_left < 0;
      const when = late
        ? `venceu em ${r.due} · ${Math.abs(r.days_left)} dia(s) de atraso`
        : r.days_left === 0 ? "vence hoje" : `vence em ${r.days_left} dia(s) (${r.due})`;
      if (r.direction === "emprestamos") {
        out.push({
          id: "", key: `loan:${r.id}`, severity: late ? "critico" : "atencao", kind: "loan", href,
          title: late ? `Cobrar devolução · ${r.partner}` : `Cobrança se aproximando · ${r.partner}`,
          message: `${r.code} ${when} — ${pend}`,
        });
      } else {
        out.push({
          id: "", key: `loan:${r.id}`, severity: late ? "critico" : "atencao", kind: "loan", href,
          title: late ? `Devolver com urgência · ${r.partner}` : `Devolução se aproximando · ${r.partner}`,
          message: `${r.code} ${when} — ${pend}`,
        });
      }
    }

    // pegamos emprestado e consumimos: não há saldo no local para devolver em espécie
    type ShortRow = { id: string; code: string; partner: string; item: string; unit: string; pending: string; available: string };
    const shortRes = await db.execute(sql`
      select l.id, l.code, p.name as partner, i.name as item, i.unit,
        greatest(0, li.quantity::numeric - coalesce((select sum(lri.quantity::numeric) from loan_return_items lri where lri.loan_item_id = li.id), 0)) as pending,
        coalesce((select sb.quantity::numeric from stock_balances sb where sb.item_id = li.item_id and sb.location_id = l.location_id), 0) as available
      from loans l
      join partners p on p.id = l.partner_id
      join loan_items li on li.loan_id = l.id
      join items i on i.id = li.item_id
      where l.direction = 'pegamos' and l.status in ('aberto', 'parcial')
        and greatest(0, li.quantity::numeric - coalesce((select sum(lri.quantity::numeric) from loan_return_items lri where lri.loan_item_id = li.id), 0))
            > coalesce((select sb.quantity::numeric from stock_balances sb where sb.item_id = li.item_id and sb.location_id = l.location_id), 0)
      limit 30
    `);
    for (const r of shortRes.rows as ShortRow[]) {
      out.push({
        id: "", key: `loanshort:${r.id}:${r.item}`, severity: "atencao", kind: "loan", href: `/emprestimos?q=${enc(r.code)}`,
        title: `Sem saldo para devolver · ${r.item}`,
        message: `${r.code} (${r.partner}) — pendente ${fmt(r.pending)} ${r.unit}, no local há ${fmt(r.available)}. Reponha antes do prazo ou combine um acerto.`,
      });
    }
  }

  if (s.demandNotify) {
    try {
      const { getDemandSignals } = await import("@/lib/demand/engine");
      const dd = await getDemandSignals(s.demandAlertDays ?? 14);
      const win = s.demandAlertDays ?? 14;
      for (const pk of dd.peaks.filter((p) => p.daysLeft <= win).slice(0, 3)) {
        const urgent = pk.mult >= 1.6 || (pk.ruptures > 0 && pk.daysLeft <= 7);
        out.push({
          id: "", key: `demand:peak:${pk.date}`, severity: urgent ? "critico" : "atencao", kind: "demand", href: "/demanda",
          title: `Pico de demanda: ${pk.title}`,
          message: `${pk.label} — ${pk.daysLeft === 0 ? "hoje" : pk.daysLeft === 1 ? "amanhã" : `em ${pk.daysLeft} dias`} · demanda ${Math.round((pk.mult - 1) * 100)}% acima do normal${pk.ruptures > 0 ? ` · ${pk.ruptures} item(ns) zeram até lá` : ""}`,
        });
      }
      const crit = dd.shopping.filter((sh) => sh.urgency === "critical" && sh.suggestion > 0);
      if (crit.length > 0) {
        const names = crit.slice(0, 3).map((c) => c.name).join(", ");
        out.push({
          id: "", key: "demand:rupture", severity: "critico", kind: "demand", href: "/demanda",
          title: `${crit.length} item(ns) em risco antes do pico`,
          message: `${names}${crit.length > 3 ? ` + ${crit.length - 3}` : ""} — compre ${crit.length === 1 ? "antes da ruptura" : "antes das rupturas"} (lista na Central de Demanda).`,
        });
      }
      if (dd.learning.missingDays.length >= 3) {
        out.push({
          id: "", key: "demand:gaps", severity: "atencao", kind: "demand", href: "/saidas",
          title: "Lançamentos em atraso alimentam a previsão",
          message: `${dd.learning.missingDays.length} dias recentes sem baixa de consumo. Lance as saídas para a inteligência aprender.`,
        });
      }
    } catch (e) {
      console.error("demand alerts", e);
    }
  }

  if (s.priceNotify) {
    try {
      const { priceIncreaseAlerts } = await import("@/lib/pricing");
      const th = Math.min(1, Math.max(0.02, (s.priceThreshold ?? 10) / 100));
      const ups = await priceIncreaseAlerts(th, 20);
      for (const u of ups) {
        const pctTxt = Math.round(u.deltaPct * 100);
        out.push({
          id: "", key: `price:${u.itemId}`, severity: pctTxt >= 25 ? "critico" : "atencao", kind: "price", href: `/itens?q=${enc(u.item)}`,
          title: `Item ficou mais caro: ${u.item}`,
          message: `Último recebimento de ${u.supplier} em ${u.lastCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/${u.unit} · ${pctTxt >= 0 ? "+" : ""}${pctTxt}% sobre a média habitual (${u.usualCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Compare fornecedores em Compras.`,
        });
      }
    } catch (e) {
      console.error("price alerts", e);
    }
  }

  const draftsRes = await db.execute(
    sql`select count(*)::int as drafts from movements where status = 'rascunho' and created_at < now() - interval '2 days'`
  );
  const drafts = Number((draftsRes.rows[0] as { drafts: number } | undefined)?.drafts ?? 0);
  if (drafts > 0) {
    out.push({
      id: "", key: "drafts", severity: "informativo", kind: "draft", href: "/entradas",
      title: `${drafts} rascunho(s) aguardando confirmação`,
      message: "Rascunhos com mais de 2 dias ainda não alteraram o estoque.",
    });
  }

  const snoozeRows = await db
    .select({ key: alerts.metadata })
    .from(alerts)
    .where(and(eq(alerts.resolved, true), gt(alerts.resolvedAt, new Date())));
  const snoozed = new Set(snoozeRows.map((r) => r.key ?? ""));

  const visible = out.filter((a) => !snoozed.has(a.key)).map((a) => ({ ...a, id: a.key }));
  const counts = {
    critico: visible.filter((a) => a.severity === "critico").length,
    atencao: visible.filter((a) => a.severity === "atencao").length,
    informativo: visible.filter((a) => a.severity === "informativo").length,
  };

  return NextResponse.json({
    alerts: visible,
    total: visible.length,
    attention: counts.critico + counts.atencao,
    counts,
    snoozed: out.length - visible.length,
    settings: {
      lowStockNotify: s.lowStockNotify,
      expiryNotify: s.expiryNotify,
      expiryDays: s.expiryDays,
      loanNotify: s.loanNotify,
      loanDueDays: s.loanDueDays,
      demandNotify: s.demandNotify,
      demandAlertDays: s.demandAlertDays,
      priceNotify: s.priceNotify,
      priceThreshold: s.priceThreshold,
    },
  });
}

/** Silencia um alerta por N horas (padrão 24h). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const key = typeof body.key === "string" ? body.key.slice(0, 200) : "";
  if (!key) return NextResponse.json({ error: "Alerta inválido" }, { status: 400 });
  const hours = Math.min(720, Math.max(1, Math.round(Number(body.hours ?? 24)) || 24));
  const sev = body.severity;
  const severity: Severity = sev === "critico" || sev === "atencao" ? sev : "informativo";
  const until = new Date(Date.now() + hours * 3_600_000);

  await db.delete(alerts).where(and(eq(alerts.resolved, true), eq(alerts.metadata, key)));
  await db.insert(alerts).values({
    severity,
    title: typeof body.title === "string" ? body.title.slice(0, 200) : key,
    message: `Silenciado por ${hours}h pelo operador`,
    metadata: key,
    resolved: true,
    resolvedAt: until,
  });
  return NextResponse.json({ ok: true, until });
}

/** Reexibe todos os alertas silenciados. */
export async function DELETE() {
  await db.delete(alerts).where(eq(alerts.resolved, true));
  return NextResponse.json({ ok: true });
}
