import { createPdf, type Align, type KpiCard } from "./kit";
import type { PurchaseDetail } from "@/lib/purchases";
import type { DemandOverview } from "@/lib/demand/engine";

const brl = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qty = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const dmy = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "-");
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const stamp = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/* Listagem genérica — usada por todos os módulos                      */
/* ------------------------------------------------------------------ */

export type ListColumn<T> = {
  header: string;
  align?: Align;
  width?: number;
  value: (row: T) => string | number;
};

export async function pdfList<T>(o: {
  org: string;
  title: string;
  subtitle?: string;
  meta?: [string, string][];
  kpis?: KpiCard[];
  columns: ListColumn<T>[];
  rows: T[];
  filename: string;
  landscape?: boolean;
  foot?: (string | number)[];
  notes?: string[];
  rowTone?: (row: T) => "red" | "amber" | "green" | null;
  print?: boolean;
}) {
  const doc = await createPdf({
    org: o.org,
    docTitle: o.title,
    orientation: o.landscape ? "landscape" : "portrait",
  });
  doc.title(o.title, o.subtitle);
  if (o.meta?.length) doc.meta(o.meta);
  if (o.kpis?.length) doc.kpis(o.kpis, Math.min(4, o.kpis.length));
  doc.table(
    o.columns.map((c) => c.header),
    o.rows.map((r) => o.columns.map((c) => c.value(r))),
    {
      align: o.columns.map((c) => c.align ?? "left"),
      widths: Object.fromEntries(o.columns.map((c, i) => [i, c.width]).filter(([, w]) => w)) as Record<number, number>,
      foot: o.foot,
      empty: "Nenhum registro para os filtros aplicados.",
      rowTone: o.rowTone ? (i) => o.rowTone!(o.rows[i]) : undefined,
      size: o.columns.length > 8 ? 6.8 : 7.4,
    }
  );
  if (o.notes?.length) {
    doc.section("Observações");
    doc.bullets(o.notes);
  }
  if (o.print) doc.openPrint();
  else doc.save(`${o.filename}_${stamp()}`);
}

/* ------------------------------------------------------------------ */
/* Pedido de compra — documento para enviar ao fornecedor              */
/* ------------------------------------------------------------------ */

export async function pdfPurchaseOrder(o: {
  org: string;
  orgDoc?: string | null;
  orgAddress?: string | null;
  detail: NonNullable<PurchaseDetail>;
  print?: boolean;
}) {
  const { order, items, receipts, totals } = o.detail;
  const doc = await createPdf({
    org: o.org,
    docTitle: `Pedido de compra ${order.code}`,
    footerNote: `Pedido ${order.code} - ${o.org}`,
  });
  doc.title(`Pedido de compra ${order.code}`, `${order.kind === "emergencial" ? "Compra emergencial" : "Compra programada"} · ${order.supplier}`);
  doc.meta([
    ["Fornecedor", order.supplier],
    ["Contato", order.contact || "-"],
    ["Data do pedido", dmy(order.orderDate)],
    ["Previsão de entrega", dmy(order.expectedDate)],
    ["Entregar em", order.locationName],
    ["Responsável", order.responsible || "-"],
    ["Situação", order.status],
    ["Total do pedido", brl(totals.value)],
  ]);
  if (o.orgDoc || o.orgAddress) {
    doc.paragraph(`${o.org}${o.orgDoc ? ` · CNPJ ${o.orgDoc}` : ""}${o.orgAddress ? ` · ${o.orgAddress}` : ""}`, 7.6);
  }

  doc.section("Itens solicitados");
  doc.table(
    ["#", "Item", "SKU", "Un.", "Quantidade", "Custo un.", "Total"],
    items.map((l, i) => [i + 1, l.name, l.sku, l.unit, qty(l.quantity), brl(l.unitCost), brl(l.total)]),
    {
      align: ["right", "left", "left", "center", "right", "right", "right"],
      widths: { 0: 8, 3: 12 },
      foot: ["", "Total do pedido", "", "", qty(totals.qty), "", brl(totals.value)],
    }
  );

  if (totals.received > 0) {
    doc.section("Recebimento");
    doc.table(
      ["Item", "Pedido", "Recebido", "Pendente", "Situação"],
      items.map((l) => [
        l.name,
        `${qty(l.quantity)} ${l.unit}`,
        `${qty(l.receivedQty)} ${l.unit}`,
        `${qty(l.pending)} ${l.unit}`,
        l.pending <= 0.0005 ? "Completo" : l.receivedQty > 0 ? "Parcial" : "Pendente",
      ]),
      { align: ["left", "right", "right", "right", "center"] }
    );
    if (receipts.length) {
      doc.table(
        ["Entrada", "Data", "Nota fiscal", "Valor"],
        receipts.map((r) => [r.code, dmy(String(r.date).slice(0, 10)), r.invoice || "-", brl(r.total)]),
        { align: ["left", "left", "left", "right"], size: 7 }
      );
    }
  }

  if (order.notes) {
    doc.section("Observações");
    doc.paragraph(order.notes);
  }
  doc.note(
    "Confira quantidade, qualidade, lote e validade na entrega. Divergências devem ser registradas no recebimento do sistema, que atualiza o estoque automaticamente.",
    "info"
  );
  doc.signatures(["Autorizado por", "Entregue por (fornecedor)", "Recebido por"]);

  if (o.print) doc.openPrint();
  else doc.save(`pedido-compra_${order.code}`);
}

/* ------------------------------------------------------------------ */
/* Lista de compras sugerida pela Central de Demanda                   */
/* ------------------------------------------------------------------ */

export async function pdfShoppingList(o: { org: string; data: DemandOverview; onlyCritical?: boolean; print?: boolean }) {
  const d = o.data;
  const rows = o.onlyCritical ? d.shopping.filter((s) => s.urgency === "critical") : d.shopping;
  const total = rows.reduce((a, s) => a + s.suggestionValue, 0);
  const doc = await createPdf({
    org: o.org,
    docTitle: "Lista de compras sugerida",
    orientation: "landscape",
    footerNote: `Lista de compras sugerida - ${o.org}`,
  });
  doc.title(
    "Lista de compras sugerida",
    `Calculada pela Central de Demanda para cobrir ${d.purchase.coverDays} dias (até a próxima reposição), com lead time, estoque mínimo e picos do calendário.`
  );
  doc.meta([
    ["Emitido em", dmy(d.today)],
    ["Próxima compra", d.purchase.nextDate ? `${dmy(d.purchase.nextDate)} (${d.purchase.dayNames.join(", ")})` : "-"],
    ["Cobertura do pedido", `${d.purchase.coverDays} dias`],
    ["Base de aprendizado", `${d.learning.levelLabel} (${d.learning.score}/100)`],
  ]);
  doc.kpis([
    { label: "Itens na lista", value: String(rows.length) },
    { label: "Valor estimado", value: brl(total) },
    { label: "Itens críticos", value: String(d.criticalCount), tone: d.criticalCount > 0 ? "red" : "green" },
    { label: "Medição do consumo", value: d.consumption.modeLabel, sub: `a cada ~${d.consumption.avgPeriodDays.toFixed(1)} dias` },
  ]);

  doc.table(
    ["Item", "SKU", "Un.", "Estoque", "Empréstimo", "Disponível", "Mín.", "Consumo/dia", "Comprar", "Custo est.", "Pedir até", "Prioridade"],
    rows.map((s) => [
      s.name,
      s.sku,
      s.unit,
      qty(s.stock),
      s.owedOut > 0 ? `-${qty(s.owedOut)}` : "-",
      qty(s.stockEffective),
      qty(s.min),
      s.noHistory ? "-" : qty(Math.round(s.avgDaily * 100) / 100),
      qty(s.suggestion),
      brl(s.suggestionValue),
      s.orderBy ? dmy(s.orderBy) : "-",
      s.urgency === "critical" ? "CRITICA" : s.urgency === "high" ? "Atencao" : "Normal",
    ]),
    {
      align: ["left", "left", "center", "right", "right", "right", "right", "right", "right", "right", "center", "center"],
      foot: ["Total", "", "", "", "", "", "", "", "", brl(total), "", ""],
      rowTone: (i) => (rows[i].urgency === "critical" ? "red" : rows[i].urgency === "high" ? "amber" : null),
      size: 6.9,
    }
  );

  const withReason = rows.filter((s) => s.reasons.length).slice(0, 18);
  if (withReason.length) {
    doc.section("Por que cada item entrou na lista");
    doc.table(
      ["Item", "Justificativa"],
      withReason.map((s) => [s.name, s.reasons.join(" · ")]),
      { align: ["left", "left"], widths: { 0: 60 }, size: 6.9 }
    );
  }

  if (d.peaks.length) {
    doc.section("Picos de demanda no período coberto");
    doc.table(
      ["Data", "Evento", "Demanda", "Itens que zeram"],
      d.peaks.slice(0, 8).map((p) => [`${dm(p.date)} (${p.daysLeft}d)`, p.title, `+${Math.round((p.mult - 1) * 100)}%`, String(p.ruptures)]),
      { align: ["left", "left", "right", "right"], size: 7 }
    );
  }
  doc.note(
    `Consumo medido ${d.consumption.spreadApplied ? "por período e distribuído pelos dias com o peso de cada dia da semana" : "a partir dos lançamentos diários"}${
      d.consumption.anchorFactor > 1.02 ? `, com correção de +${Math.round((d.consumption.anchorFactor - 1) * 100)}% apontada pelo inventário` : ""
    }. O que está no estoque por empréstimo não conta como disponível.`,
    "info"
  );
  doc.signatures(["Conferido por", "Aprovado por"]);

  if (o.print) doc.openPrint();
  else doc.save(`lista-de-compras_${d.today}`);
}

/* ------------------------------------------------------------------ */
/* Central de Demanda — relatório completo                             */
/* ------------------------------------------------------------------ */

export async function pdfDemandReport(o: { org: string; data: DemandOverview; print?: boolean }) {
  const d = o.data;
  const doc = await createPdf({ org: o.org, docTitle: "Central de Demanda", footerNote: `Central de Demanda - ${o.org}` });
  doc.title("Central de Demanda", `Previsão para ${d.horizon} dias a partir de ${dmy(d.today)} — calendário, aprendizado e necessidade de compra.`);
  doc.meta([
    ["Aprendizado", `${d.learning.levelLabel} (${d.learning.score}/100)`],
    ["Histórico", `${d.learning.observedDays} dias · ${d.consumption.recordingDays} lançamentos`],
    ["Medição", d.consumption.modeLabel],
    ["Ciclo de compra", d.purchase.dayNames.join(", ") || "-"],
  ]);
  doc.kpis([
    { label: "Demanda 7 dias", value: `${d.summary.avgIndex7 >= 1 ? "+" : ""}${Math.round((d.summary.avgIndex7 - 1) * 100)}%` },
    { label: "Próximo pico", value: d.summary.nextPeak ? dm(d.summary.nextPeak.date) : "-", sub: d.summary.nextPeak?.title },
    { label: "Itens em risco", value: String(d.criticalCount), tone: d.criticalCount > 0 ? "red" : "green" },
    { label: "Compra sugerida", value: brl(d.shoppingTotal) },
  ]);

  doc.section("Leitura do período");
  doc.bullets(d.insights.map((i) => `${i.title} — ${i.text}`));

  doc.section("Calendário de demanda", "Índice 1,00 = dia normal. Eventos, folha e ritmo semanal combinados.");
  doc.table(
    ["Data", "Dia", "Índice", "Eventos / folha", "Itens que zeram"],
    d.calendar.slice(0, 45).map((c) => [
      dm(c.date),
      c.weekdayName.slice(0, 3),
      `${c.index.toFixed(2)}`,
      [...c.events.map((e) => e.title), c.isPayday ? "Salário" : "", c.isAdvance ? "Vale" : ""].filter(Boolean).join(", ") || "-",
      c.ruptures > 0 ? String(c.ruptures) : "-",
    ]),
    {
      align: ["left", "center", "right", "left", "right"],
      size: 6.8,
      rowTone: (i) => {
        const c = d.calendar[i];
        return c.index >= 1.6 ? "red" : c.index >= 1.25 ? "amber" : null;
      },
    }
  );

  doc.section("Como a casa se comporta", "Peso aprendido com o histórico × estimativa inicial do segmento.");
  doc.table(
    ["Dia da semana", "Peso aprendido", "Estimativa inicial", "Dias observados"],
    d.factors.dow.map((f) => [f.name, `x${f.factor.toFixed(2)}`, `x${f.prior.toFixed(2)}`, String(f.samples)]),
    { align: ["left", "right", "right", "right"] }
  );
  doc.table(
    ["Efeito", "Peso", "Estimativa", "Amostras"],
    [
      ["Salário (5º dia útil + 2 dias)", `x${d.factors.payday.factor.toFixed(2)}`, `x${d.factors.payday.prior.toFixed(2)}`, String(d.factors.payday.samples)],
      ["Vale / adiantamento (+1 dia)", `x${d.factors.advance.factor.toFixed(2)}`, `x${d.factors.advance.prior.toFixed(2)}`, String(d.factors.advance.samples)],
    ],
    { align: ["left", "right", "right", "right"] }
  );

  if (d.eventLearning.length) {
    doc.section("Datas que movem a casa");
    doc.table(
      ["Data comemorativa", "Peso usado", "Estimativa", "Ocorrências", "Última", "Próxima"],
      d.eventLearning.slice(0, 20).map((e) => [
        e.title,
        `x${e.learned.toFixed(2)}`,
        `x${e.prior.toFixed(2)}`,
        String(e.samples),
        dmy(e.lastSeen),
        dmy(e.nextDate),
      ]),
      { align: ["left", "right", "right", "right", "left", "left"], size: 7 }
    );
  }

  doc.section("Necessidade de compra", `Cobrindo ${d.purchase.coverDays} dias até a próxima reposição.`);
  doc.table(
    ["Item", "Disponível", "Mín.", "Consumo/dia", "Comprar", "Custo est.", "Prioridade"],
    d.shopping.slice(0, 40).map((s) => [
      s.name,
      `${qty(s.stockEffective)} ${s.unit}`,
      qty(s.min),
      s.noHistory ? "-" : qty(Math.round(s.avgDaily * 100) / 100),
      `${qty(s.suggestion)} ${s.unit}`,
      brl(s.suggestionValue),
      s.urgency === "critical" ? "CRITICA" : s.urgency === "high" ? "Atencao" : "Normal",
    ]),
    {
      align: ["left", "right", "right", "right", "right", "right", "center"],
      foot: ["Total", "", "", "", "", brl(d.shoppingTotal), ""],
      rowTone: (i) => (d.shopping[i]?.urgency === "critical" ? "red" : d.shopping[i]?.urgency === "high" ? "amber" : null),
      size: 7,
    }
  );

  doc.section("Metodologia");
  doc.bullets([
    `Consumo ${d.consumption.spreadApplied ? "lançado por período e distribuído pelos dias com o peso de cada dia da semana (o total do lançamento é preservado)" : "lançado diariamente"}.`,
    d.consumption.anchorCounts > 0
      ? `Ancoragem por inventário: ${d.consumption.anchorCounts} contagem(ns); diferença de ${brl(d.consumption.missingValue)} a menos que o sistema virou correção de +${Math.round((d.consumption.anchorFactor - 1) * 100)}% no consumo.`
      : "Ancoragem por inventário: aguardando a primeira contagem concluída.",
    "Ritmo semanal, mensal e efeito de salário/vale aprendidos com shrinkage: começam na estimativa do segmento e migram para o observado conforme as amostras acumulam.",
    "Estoque de empréstimo a devolver não entra como disponível; a devolução é tratada como saída futura garantida.",
    `Sugestão de compra = consumo projetado dia a dia até a próxima reposição + estoque mínimo - disponível, com margem de segurança por pico e maturidade da base.`,
  ]);

  if (o.print) doc.openPrint();
  else doc.save(`central-de-demanda_${d.today}`);
}
