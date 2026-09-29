"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ShoppingCart,
  Plus,
  RefreshCw,
  Eye,
  Send,
  PackageCheck,
  XCircle,
  Trash2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Truck,
  Wallet,
  Clock3,
  X,
  Loader2,
  FileText,
  LineChart,
} from "lucide-react";
import {
  StatCard,
  Tabs,
  TableShell,
  Th,
  Td,
  SearchInput,
  Select,
  StatusPill,
  EmptyState,
  Modal,
  Field,
  inputCls,
  PrimaryButton,
  PageBadge,
  LoadingRows,
} from "@/components/ui";
import { PdfButton } from "@/components/PdfButton";
import { useToast } from "@/components/Toast";
import { useApp } from "@/components/AppContext";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatCurrency, formatQty } from "@/lib/format";
import { pdfList, pdfPurchaseOrder } from "@/lib/pdf/docs";
import type { DemandOverview, ShoppingItem } from "@/lib/demand/engine";
import type { PurchaseDetail } from "@/lib/purchases";

type Order = {
  id: string;
  code: string;
  status: "rascunho" | "enviado" | "parcial" | "recebido" | "cancelado";
  kind: string;
  supplier: string;
  contact: string | null;
  responsible: string | null;
  orderDate: string;
  expectedDate: string | null;
  daysToExpected: number | null;
  totalValue: string;
  locationName: string;
  itemCount: number;
  totalQty: string;
  receivedQty: string;
  itemsLabel: string | null;
};
type PriceRow = { itemId: string; item: string; sku: string; unit: string; cost: number; supplier: string; date: string; usual: number | null; deltaPct: number | null; compras: number; best: number | null; bestSupplier: string | null; savings: number; expensive: boolean };
type LastPrice = { cost: number; supplier: string; date: string; usual: number | null };
type PriceData = { rows: PriceRow[]; threshold: number; stats: { items: number; withHistory: number; expensive: number; savingsTotal: number; priceNotify: boolean } };
type Stats = { draft: number; sent: number; partial: number; done: number; cancelled: number; total: number; openValue: number; monthValue: number; late: number };
const EMPTY: Stats = { draft: 0, sent: 0, partial: 0, done: 0, cancelled: 0, total: 0, openValue: 0, monthValue: 0, late: 0 };

const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");
const today = () => new Date().toLocaleDateString("en-CA");
const plus = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
};

function StatusTag({ s }: { s: Order["status"] }) {
  if (s === "rascunho") return <StatusPill tone="gray">Rascunho</StatusPill>;
  if (s === "enviado") return <StatusPill tone="blue">Enviado</StatusPill>;
  if (s === "parcial") return <StatusPill tone="yellow">Parcial</StatusPill>;
  if (s === "recebido") return <StatusPill tone="green">Recebido</StatusPill>;
  return <StatusPill tone="gray">Cancelado</StatusPill>;
}

export default function ComprasPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Carregando…</div>}>
      <ComprasInner />
    </Suspense>
  );
}

function ComprasInner() {
  const sp = useSearchParams();
  const { push } = useToast();
  const { org, refreshAlerts } = useApp();
  const [rows, setRows] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [status, setStatus] = useState("open");
  const [newOpen, setNewOpen] = useState(sp.get("novo") === "1");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [priceOpen, setPriceOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<{ orders: Order[]; stats: Stats }>(`/api/purchases?status=${status}&q=${encodeURIComponent(q)}`);
    if (r.ok) {
      setRows(r.data.orders ?? []);
      setStats(r.data.stats ?? EMPTY);
    } else push({ kind: "error", title: "Não foi possível carregar os pedidos", msg: r.error });
    setLoading(false);
  }, [status, q, push]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const exportList = (print: boolean) =>
    pdfList<Order>({
      org: org.name,
      title: "Pedidos de compra",
      subtitle: `Situação: ${status === "open" ? "em aberto" : status === "all" ? "todos" : status}`,
      landscape: true,
      print,
      kpis: [
        { label: "Em aberto", value: String(stats.draft + stats.sent + stats.partial) },
        { label: "Valor em aberto", value: formatCurrency(stats.openValue) },
        { label: "Recebido (30 dias)", value: formatCurrency(stats.monthValue) },
        { label: "Entregas atrasadas", value: String(stats.late), tone: stats.late > 0 ? "red" : "green" },
      ],
      columns: [
        { header: "Pedido", value: (r) => r.code },
        { header: "Fornecedor", value: (r) => r.supplier },
        { header: "Tipo", value: (r) => (r.kind === "emergencial" ? "Emergencial" : "Programada") },
        { header: "Data", value: (r) => dmy(r.orderDate) },
        { header: "Previsão", value: (r) => dmy(r.expectedDate) },
        { header: "Entrega em", value: (r) => r.locationName },
        { header: "Itens", align: "right", value: (r) => r.itemCount },
        { header: "Recebido", align: "right", value: (r) => `${formatQty(r.receivedQty)}/${formatQty(r.totalQty)}` },
        { header: "Valor", align: "right", value: (r) => formatCurrency(r.totalValue) },
        { header: "Situação", align: "center", value: (r) => r.status },
      ],
      rows,
      foot: ["Total", "", "", "", "", "", "", "", formatCurrency(rows.reduce((a, r) => a + Number(r.totalValue), 0)), ""],
      rowTone: (r) => (r.status === "parcial" ? "amber" : r.status === "recebido" ? "green" : null),
      filename: "pedidos-de-compra",
    });

  return (
    <div className="animate-fade-in">
      <p className="text-[12px] text-zinc-500">
        Movimentação <span className="mx-1.5 text-zinc-700">›</span> <span className="text-zinc-300">Compras</span>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-[28px] font-bold tracking-tight text-white">Compras</h2>
            <PageBadge>Pedidos e recebimento</PageBadge>
          </div>
          <p className="mt-1.5 max-w-2xl text-[13.5px] text-zinc-400">
            Monte o pedido a partir da sugestão da Central de Demanda, envie o PDF ao fornecedor e receba —
            o recebimento vira entrada no estoque automaticamente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[13px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white">
            <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Atualizar
          </button>
          <button onClick={() => setPriceOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[13px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white">
            <LineChart className="size-4" /> Preços
          </button>
          <PdfButton build={exportList} label="PDF da lista" disabled={rows.length === 0} />
          <PrimaryButton onClick={() => setNewOpen(true)}>
            <Plus className="size-4" /> Novo pedido
          </PrimaryButton>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pedidos em aberto" value={stats.draft + stats.sent + stats.partial} hint={`${stats.draft} rascunho(s) · ${stats.sent} enviado(s) · ${stats.partial} parcial(is)`} icon={<ShoppingCart className="size-4" />} />
        <StatCard label="Valor em aberto" value={formatCurrency(stats.openValue)} hint="Compromissado com fornecedores" icon={<Wallet className="size-4" />} />
        <StatCard label="Recebido (30 dias)" value={formatCurrency(stats.monthValue)} hint={`${stats.done} pedido(s) concluído(s)`} icon={<PackageCheck className="size-4" />} />
        <StatCard label="Entregas atrasadas" value={stats.late} hint={stats.late > 0 ? "Passaram da previsão" : "Nenhuma pendência"} icon={<AlertTriangle className="size-4" />} accent={stats.late > 0 ? <span className="size-1.5 rounded-full bg-red-500" /> : null} />
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#141417]">
        <div className="px-5 py-4">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por número, fornecedor, responsável ou item…" />
        </div>
        <Tabs
          active={status}
          onChange={setStatus}
          tabs={[
            { value: "open", label: "Em aberto", count: stats.draft + stats.sent + stats.partial },
            { value: "rascunho", label: "Rascunhos", count: stats.draft },
            { value: "enviado", label: "Enviados", count: stats.sent },
            { value: "recebido", label: "Recebidos", count: stats.done },
            { value: "all", label: "Todos", count: stats.total },
          ]}
        />
        {loading && rows.length === 0 ? (
          <LoadingRows label="Carregando pedidos…" />
        ) : (
          <TableShell
            head={<><Th>Pedido / fornecedor</Th><Th>Itens</Th><Th>Entrega</Th><Th>Recebido</Th><Th>Valor</Th><Th>Situação</Th><Th className="text-right">Ações</Th></>}
            empty={rows.length === 0}
          >
            {rows.length === 0 ? (
              <EmptyState
                icon={<ShoppingCart className="size-7" />}
                title={status === "open" ? "Nenhum pedido em aberto" : "Nenhum pedido encontrado"}
                description="Crie um pedido do zero ou importe a lista sugerida pela Central de Demanda — ela calcula o que comprar até a próxima reposição."
                action={<PrimaryButton onClick={() => setNewOpen(true)}><Plus className="size-4" /> Novo pedido</PrimaryButton>}
              />
            ) : (
              rows.map((o) => {
                const late = (o.status === "enviado" || o.status === "parcial") && o.daysToExpected !== null && o.daysToExpected < 0;
                const pct = Number(o.totalQty) > 0 ? Math.round((Number(o.receivedQty) / Number(o.totalQty)) * 100) : 0;
                return (
                  <tr key={o.id} className={cn("transition hover:bg-white/[0.02]", late && "bg-red-500/[0.03]")}>
                    <Td>
                      <button onClick={() => setDetailId(o.id)} className="text-left">
                        <p className="font-mono text-[12.5px] font-semibold text-white hover:underline">{o.code}</p>
                        <p className="text-[13px] font-medium text-zinc-200">{o.supplier}</p>
                        <p className="text-[11.5px] text-zinc-500">{o.kind === "emergencial" ? "Emergencial" : "Programada"} · {o.locationName}</p>
                      </button>
                    </Td>
                    <Td>
                      <p className="text-[12.5px] text-zinc-300">{o.itemCount} {o.itemCount === 1 ? "item" : "itens"}</p>
                      <p className="max-w-[220px] truncate text-[11.5px] text-zinc-500" title={o.itemsLabel ?? ""}>{o.itemsLabel}</p>
                    </Td>
                    <Td>
                      <p className="text-[12.5px] text-zinc-300">{dmy(o.expectedDate)}</p>
                      <p className={cn("text-[11.5px]", late ? "font-semibold text-red-400" : "text-zinc-500")}>
                        {o.expectedDate === null ? "sem previsão" : late ? `atrasado ${Math.abs(o.daysToExpected!)}d` : o.daysToExpected === 0 ? "chega hoje" : o.daysToExpected! > 0 ? `em ${o.daysToExpected}d` : "—"}
                      </p>
                    </Td>
                    <Td>
                      {o.status === "recebido" ? <span className="text-[12.5px] text-emerald-400">completo</span> : (
                        <div className="min-w-[90px]">
                          <p className="text-[12.5px] text-zinc-300">{pct}%</p>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )}
                    </Td>
                    <Td><span className="text-[13px] font-semibold text-white">{formatCurrency(o.totalValue)}</span></Td>
                    <Td><StatusTag s={o.status} /></Td>
                    <Td className="text-right">
                      <button onClick={() => setDetailId(o.id)} title="Abrir pedido" className="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white">
                        <Eye className="size-4" />
                      </button>
                    </Td>
                  </tr>
                );
              })
            )}
          </TableShell>
        )}
      </div>

      <PriceCompareModal open={priceOpen} onClose={() => setPriceOpen(false)} orgName={org.name} />
      <NewOrderModal open={newOpen} onClose={() => setNewOpen(false)} onSaved={(id) => { setNewOpen(false); load(); refreshAlerts(); setDetailId(id); }} />
      <OrderDetailModal id={detailId} orgName={org.name} onClose={() => setDetailId(null)} onChanged={() => { load(); refreshAlerts(); }} />
    </div>
  );
}

/* ------------------------------------------------------------------ Novo pedido */

type Line = { key: number; itemId: string; quantity: string; unitCost: string };
let lk = 1;
const emptyLine = (): Line => ({ key: lk++, itemId: "", quantity: "", unitCost: "" });
type ItemOpt = { id: string; name: string; sku: string; unit: string; costPrice: string; supplier: string | null };
type LocOpt = { id: string; name: string };

function NewOrderModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (id: string) => void }) {
  const { push } = useToast();
  const [tab, setTab] = useState<"sugestao" | "manual">("sugestao");
  const [demand, setDemand] = useState<DemandOverview | null>(null);
  const [loadingDemand, setLoadingDemand] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<ItemOpt[]>([]);
  const [locs, setLocs] = useState<LocOpt[]>([]);
  const [supplier, setSupplier] = useState("");
  const [contact, setContact] = useState("");
  const [locationId, setLocationId] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState(plus(2));
  const [kind, setKind] = useState<"programada" | "emergencial">("programada");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab("sugestao"); setPicked(new Set()); setSupplier(""); setContact(""); setNotes("");
    setOrderDate(today()); setExpectedDate(plus(2)); setKind("programada"); setLines([emptyLine()]);
    setLoadingDemand(true);
    api<DemandOverview>("/api/demand/overview?horizon=45").then((r) => {
      setLoadingDemand(false);
      if (r.ok) {
        setDemand(r.data);
        setPicked(new Set(r.data.shopping.filter((s) => s.urgency !== "normal" && s.suggestion > 0).map((s) => s.itemId)));
        if (r.data.purchase.nextDate) setOrderDate(r.data.purchase.nextDate < today() ? today() : r.data.purchase.nextDate);
      }
    });
    api<{ items: ItemOpt[] }>("/api/items?status=active").then((r) => { if (r.ok) setItems(r.data.items ?? []); });
    api<{ locations: LocOpt[] }>("/api/locations?status=active").then((r) => {
      if (r.ok) {
        const ls = (r.data.locations ?? []).map((l) => ({ id: l.id, name: l.name }));
        setLocs(ls);
        setLocationId((c) => c || ls[0]?.id || "");
      }
    });
  }, [open]);

  const sugg = demand?.shopping ?? [];
  const pickedItems = useMemo(() => sugg.filter((s) => picked.has(s.itemId)), [sugg, picked]);
  const manualValid = lines.filter((l) => l.itemId && Number(l.quantity) > 0);
  const total = tab === "sugestao"
    ? pickedItems.reduce((a, s) => a + s.suggestionValue, 0)
    : manualValid.reduce((a, l) => a + Number(l.quantity) * Number(l.unitCost || 0), 0);

  if (!open) return null;

  const save = async (send: boolean) => {
    if (saving) return;
    if (!supplier.trim()) return push({ kind: "error", title: "Informe o fornecedor" });
    if (!locationId) return push({ kind: "error", title: "Selecione o local de entrega" });
    const payloadItems = tab === "sugestao"
      ? pickedItems.map((s) => ({ itemId: s.itemId, quantity: s.suggestion, unitCost: s.suggestion > 0 ? s.suggestionValue / s.suggestion : 0 }))
      : manualValid.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), unitCost: Number(l.unitCost || 0) }));
    if (payloadItems.length === 0) return push({ kind: "error", title: "Selecione ao menos um item" });
    setSaving(true);
    const r = await api<{ order: { id: string; code: string } }>("/api/purchases", {
      method: "POST",
      json: { supplier, contact, locationId, orderDate, expectedDate, kind, notes, status: send ? "enviado" : "rascunho", items: payloadItems },
    });
    setSaving(false);
    if (r.ok) {
      push({ kind: "success", title: `Pedido ${r.data.order.code} criado`, msg: send ? "Marcado como enviado ao fornecedor." : "Salvo como rascunho." });
      onSaved(r.data.order.id);
    } else push({ kind: "error", title: "Não foi possível criar", msg: r.error });
  };

  const toggleAll = (on: boolean) => setPicked(on ? new Set(sugg.filter((s) => s.suggestion > 0).map((s) => s.itemId)) : new Set());

  return (
    <Modal open onClose={saving ? () => {} : onClose} wide title="Novo pedido de compra" subtitle="Importe a sugestão da inteligência ou monte manualmente">
      <div className="space-y-4">
        <div className="flex gap-2">
          {([["sugestao", "Da Central de Demanda"], ["manual", "Manual"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)} className={cn("rounded-lg border px-3.5 py-2 text-[12.5px] font-medium transition", tab === v ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-zinc-400 hover:text-white")}>
              {v === "sugestao" ? <Sparkles className="mr-1.5 inline size-3.5" /> : null}{l}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Fornecedor" required>
            <input value={supplier} maxLength={120} onChange={(e) => setSupplier(e.target.value)} placeholder="Ex.: Peixaria Central" className={inputCls} list="sup-list" />
            <datalist id="sup-list">{[...new Set(items.map((i) => i.supplier).filter(Boolean))].map((s) => <option key={s as string} value={s as string} />)}</datalist>
          </Field>
          <Field label="Contato"><input value={contact} maxLength={120} onChange={(e) => setContact(e.target.value)} placeholder="WhatsApp, vendedor…" className={inputCls} /></Field>
          <Field label="Entregar em" required>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls}>
              {locs.map((l) => <option key={l.id} value={l.id} className="bg-zinc-900">{l.name}</option>)}
            </select>
          </Field>
          <Field label="Tipo de compra">
            <select value={kind} onChange={(e) => setKind(e.target.value as "programada" | "emergencial")} className={inputCls}>
              <option value="programada" className="bg-zinc-900">Programada (dia do ciclo)</option>
              <option value="emergencial" className="bg-zinc-900">Emergencial (fora do ciclo)</option>
            </select>
          </Field>
          <Field label="Data do pedido"><input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className={inputCls} /></Field>
          <Field label="Previsão de entrega"><input type="date" value={expectedDate} min={orderDate} onChange={(e) => setExpectedDate(e.target.value)} className={inputCls} /></Field>
        </div>

        {tab === "sugestao" ? (
          loadingDemand ? (
            <LoadingRows label="Calculando a sugestão…" />
          ) : sugg.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-[13px] text-zinc-500">
              Nenhuma compra sugerida no momento — o estoque cobre o período. Use a aba Manual se precisar comprar mesmo assim.
            </p>
          ) : (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.015]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
                <p className="text-[12.5px] text-zinc-400">
                  Cobrindo <strong className="text-zinc-200">{demand?.purchase.coverDays} dias</strong> até a próxima reposição
                  {demand?.purchase.nextDate ? ` (${dmy(demand.purchase.nextDate)})` : ""} · {picked.size} de {sugg.length} selecionados
                </p>
                <div className="flex gap-3 text-[12px]">
                  <button onClick={() => toggleAll(true)} className="text-zinc-400 hover:text-white">Todos</button>
                  <button onClick={() => setPicked(new Set(sugg.filter((s) => s.urgency === "critical").map((s) => s.itemId)))} className="text-zinc-400 hover:text-white">Só críticos</button>
                  <button onClick={() => toggleAll(false)} className="text-zinc-400 hover:text-white">Nenhum</button>
                </div>
              </div>
              <div className="max-h-[320px] overflow-y-auto p-2">
                {sugg.map((s) => {
                  const on = picked.has(s.itemId);
                  return (
                    <button
                      key={s.itemId}
                      onClick={() => setPicked((p) => { const n = new Set(p); if (n.has(s.itemId)) n.delete(s.itemId); else n.add(s.itemId); return n; })}
                      className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition", on ? "bg-white/[0.06]" : "hover:bg-white/[0.03]")}
                    >
                      <span className={cn("grid size-5 shrink-0 place-items-center rounded border text-[11px] font-bold", on ? "border-emerald-400 bg-emerald-400 text-zinc-950" : "border-white/20")}>{on ? "✓" : ""}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-white">{s.name}</span>
                        <span className="block truncate text-[11.5px] text-zinc-500">
                          disp. {formatQty(s.stockEffective)} {s.unit}{s.owedOut > 0 ? ` (−${formatQty(s.owedOut)} empréstimo)` : ""} · {s.reasons[0] ?? ""}
                        </span>
                      </span>
                      {s.urgency === "critical" ? <StatusPill tone="red">Crítico</StatusPill> : s.urgency === "high" ? <StatusPill tone="yellow">Atenção</StatusPill> : null}
                      <span className="w-[130px] shrink-0 text-right">
                        <span className="block text-[13px] font-bold text-white">{formatQty(s.suggestion)} {s.unit}</span>
                        <span className="block text-[11.5px] text-zinc-500">{formatCurrency(s.suggestionValue)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12.5px] font-medium text-zinc-400">Itens do pedido</p>
              <button onClick={() => setLines((p) => [...p, emptyLine()])} className="text-[12.5px] font-semibold text-zinc-200 hover:text-white">+ Adicionar linha</button>
            </div>
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.key} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_110px_120px_36px]">
                  <select
                    value={l.itemId}
                    onChange={(e) => {
                      const it = items.find((x) => x.id === e.target.value);
                      setLines((p) => p.map((x) => (x.key === l.key ? { ...x, itemId: e.target.value, unitCost: x.unitCost || String(Number(it?.costPrice ?? 0)) } : x)));
                    }}
                    className={inputCls}
                  >
                    <option value="" className="bg-zinc-900">Selecionar item…</option>
                    {items.map((i) => <option key={i.id} value={i.id} className="bg-zinc-900">{i.name} · {i.unit}</option>)}
                  </select>
                  <input type="number" min="0" step="0.001" value={l.quantity} placeholder="Qtd" onChange={(e) => setLines((p) => p.map((x) => (x.key === l.key ? { ...x, quantity: e.target.value } : x)))} className={`${inputCls} px-2 text-center`} />
                  <input type="number" min="0" step="0.01" value={l.unitCost} placeholder="Custo un." onChange={(e) => setLines((p) => p.map((x) => (x.key === l.key ? { ...x, unitCost: e.target.value } : x)))} className={`${inputCls} px-2 text-center`} />
                  <button onClick={() => setLines((p) => (p.length === 1 ? [emptyLine()] : p.filter((x) => x.key !== l.key)))} className="grid h-[42px] place-items-center rounded-lg border border-white/[0.08] text-zinc-500 hover:text-red-400"><X className="size-4" /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        <Field label="Observações para o fornecedor">
          <textarea value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Horário de entrega, condição de pagamento, exigências de qualidade…" className={`${inputCls} resize-none`} />
        </Field>

        <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-zinc-400">Total do pedido: <strong className="text-white">{formatCurrency(total)}</strong></p>
          <div className="flex flex-wrap justify-end gap-2.5">
            <button onClick={onClose} disabled={saving} className="rounded-lg border border-white/10 px-4 py-2.5 text-[13px] font-medium text-zinc-300 hover:text-white disabled:opacity-50">Cancelar</button>
            <button onClick={() => save(false)} disabled={saving} className="rounded-lg border border-white/10 px-4 py-2.5 text-[13px] font-semibold text-zinc-200 hover:text-white disabled:opacity-50">
              {saving ? <Loader2 className="inline size-4 animate-spin" /> : null} Salvar rascunho
            </button>
            <PrimaryButton onClick={() => save(true)} disabled={saving}><Send className="size-4" /> Criar e marcar enviado</PrimaryButton>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Detalhe */

function OrderDetailModal({ id, orgName, onClose, onChanged }: { id: string | null; orgName: string; onClose: () => void; onChanged: () => void }) {
  const { push } = useToast();
  const [data, setData] = useState<NonNullable<PurchaseDetail> | null>(null);
  const [mode, setMode] = useState<"view" | "receive" | "cancel">("view");
  const [busy, setBusy] = useState(false);
  const [recQty, setRecQty] = useState<Record<string, string>>({});
  const [recCost, setRecCost] = useState<Record<string, string>>({});
  const [recLot, setRecLot] = useState<Record<string, string>>({});
  const [recExp, setRecExp] = useState<Record<string, string>>({});
  const [invoice, setInvoice] = useState("");
  const [recDate, setRecDate] = useState(today());
  const [lastPrices, setLastPrices] = useState<Record<string, LastPrice>>({});
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    const r = await api<NonNullable<PurchaseDetail>>(`/api/purchases/${id}`);
    if (r.ok) {
      setData(r.data);
      const q: Record<string, string> = {};
      for (const l of r.data.items) q[l.id] = l.pending > 0 ? String(l.pending) : "";
      setRecQty(q);
      const prices = await api<{ rows: (PriceRow & { itemId: string })[] }>("/api/pricing");
      if (prices.ok) {
        const map: Record<string, LastPrice> = {};
        for (const row of prices.data.rows) {
          map[row.itemId] = { cost: row.cost, supplier: row.supplier, date: row.date, usual: row.usual };
        }
        setLastPrices(map);
        const costInit: Record<string, string> = {};
        for (const l of r.data.items) {
          const lp = map[l.itemId];
          costInit[l.id] = String(lp?.cost ?? l.unitCost ?? 0);
        }
        setRecCost(costInit);
      }
    } else push({ kind: "error", title: "Erro ao abrir pedido", msg: r.error });
  }, [id, push]);

  useEffect(() => {
    setData(null); setMode("view"); setInvoice(""); setReason(""); setRecDate(today()); setRecLot({}); setRecExp({});
    load();
  }, [id, load]);

  if (!id) return null;
  const o = data?.order;
  const open = o ? ["rascunho", "enviado", "parcial"].includes(o.status) : false;

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (busy) return;
    setBusy(true);
    const r = await api<{ result?: { movementCode?: string; status?: string } }>(`/api/purchases/${id}`, { method: "PATCH", json: { action, ...extra } });
    setBusy(false);
    if (r.ok) {
      const msg = action === "receive" ? `Entrada ${r.data.result?.movementCode} lançada no estoque.` : undefined;
      push({ kind: "success", title: action === "send" ? "Pedido enviado" : action === "receive" ? "Recebimento registrado" : "Pedido cancelado", msg });
      setMode("view");
      load();
      onChanged();
    } else push({ kind: "error", title: "Não foi possível concluir", msg: r.error });
  };

  const submitReceive = () => {
    if (!data) return;
    const lines = data.items
      .map((l) => ({
        lineId: l.id,
        quantity: Number(recQty[l.id] || 0),
        unitCost: recCost[l.id] === undefined || recCost[l.id] === "" ? undefined : Number(recCost[l.id]),
        lotCode: recLot[l.id],
        expiryDate: recExp[l.id],
      }))
      .filter((l) => l.quantity > 0);
    if (lines.length === 0) return push({ kind: "error", title: "Informe as quantidades recebidas" });
    act("receive", { lines, invoiceNumber: invoice, receiptDate: recDate });
  };

  const del = async () => {
    if (!confirm("Excluir este rascunho?")) return;
    const r = await api(`/api/purchases/${id}`, { method: "DELETE" });
    if (r.ok) { push({ kind: "success", title: "Rascunho excluído" }); onClose(); onChanged(); }
    else push({ kind: "error", title: "Não foi possível excluir", msg: r.error });
  };

  return (
    <Modal open onClose={busy ? () => {} : onClose} wide title={o ? `Pedido ${o.code}` : "Pedido"} subtitle={o ? `${o.supplier} · ${o.kind === "emergencial" ? "emergencial" : "programada"} · entrega em ${o.locationName}` : "Carregando…"}>
      {!data || !o ? (
        <LoadingRows label="Carregando pedido…" />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusTag s={o.status as Order["status"]} />
            <span className="text-[12.5px] text-zinc-400">Pedido {dmy(o.orderDate)} · previsão {dmy(o.expectedDate)}</span>
            <span className="ml-auto text-[13px] font-semibold text-white">{formatCurrency(data.totals.value)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
            {[["Itens", String(data.items.length)], ["Quantidade", formatQty(data.totals.qty)], ["Recebido", formatQty(data.totals.received)], ["Pendente", formatQty(data.totals.pending)]].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/[0.07] p-3">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">{k}</p>
                <p className="mt-1 font-semibold text-white">{v}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
            <table className="w-full min-w-[620px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2.5">Item</th>
                  <th className="px-4 py-2.5 text-right">Pedido</th>
                  <th className="px-4 py-2.5 text-right">Recebido</th>
                  <th className="px-4 py-2.5 text-right">Custo un.</th>
                  {mode === "receive" ? <th className="px-4 py-2.5 text-right">Receber (qtd · R$/un · lote · validade)</th> : <th className="px-4 py-2.5 text-right">Total</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {data.items.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-white">{l.name}</p>
                      <p className="font-mono text-[11px] text-zinc-500">{l.sku} · estoque atual {formatQty(l.stock)} {l.unit}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-200">{formatQty(l.quantity)} {l.unit}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-300">{l.receivedQty > 0 ? formatQty(l.receivedQty) : "—"}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-300">{formatCurrency(l.unitCost)}</td>
                    {mode === "receive" ? (
                      <td key="rcv" className="px-4 py-2.5">
                        <div className="flex flex-col items-end gap-1">
                          <input type="number" min="0" max={l.pending} step="0.001" value={recQty[l.id] ?? ""} disabled={l.pending <= 0} onChange={(e) => setRecQty((p) => ({ ...p, [l.id]: e.target.value }))} className={`${inputCls} w-[100px] px-2 text-right disabled:opacity-40`} />
                          <div className="flex gap-1">
                            <input type="number" min="0" step="0.01" value={recCost[l.id] ?? ""} onChange={(e) => setRecCost((p) => ({ ...p, [l.id]: e.target.value }))} placeholder="R$/un" title="Preço da nota fiscal" className={`${inputCls} w-[92px] px-2 py-1 text-right text-[11px]`} />
                            <input value={recLot[l.id] ?? ""} onChange={(e) => setRecLot((p) => ({ ...p, [l.id]: e.target.value }))} placeholder="Lote" className={`${inputCls} w-[74px] px-2 py-1 text-[11px]`} />
                            <input type="date" value={recExp[l.id] ?? ""} onChange={(e) => setRecExp((p) => ({ ...p, [l.id]: e.target.value }))} className={`${inputCls} w-[118px] px-2 py-1 text-[11px]`} />
                          </div>
                          {(() => {
                            const lp = lastPrices[l.itemId];
                            if (!lp) return null;
                            const typed = Number(recCost[l.id] ?? 0);
                            const delta = typed > 0 && lp.cost > 0 ? (typed - lp.cost) / lp.cost : null;
                            return (
                              <p className={cn("text-right text-[10.5px]", delta === null ? "text-zinc-600" : delta > 0.05 ? "font-semibold text-red-400" : "text-emerald-400")}>
                                último: {formatCurrency(lp.cost)} ({dmy(lp.date)})
                                {delta !== null && Math.abs(delta) > 0.005 ? ` · ${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}%` : ""}
                                {lp.usual !== null && lp.usual > lp.cost * 1.02 ? ` · melhor média: ${formatCurrency(lp.usual)}` : ""}
                              </p>
                            );
                          })()}
                        </div>
                      </td>
                    ) : (
                      <td className="px-4 py-2.5 text-right font-semibold text-white">{formatCurrency(l.total)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {o.notes ? <p className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5 text-[12.5px] text-zinc-400">{o.notes}</p> : null}
          {o.cancelReason ? <p className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-3.5 text-[12.5px] text-red-200">Cancelado: {o.cancelReason}</p> : null}

          {data.receipts.length > 0 ? (
            <div>
              <p className="mb-2 text-[12.5px] font-semibold text-zinc-300">Entradas geradas</p>
              <div className="space-y-1.5">
                {data.receipts.map((r) => (
                  <p key={r.id} className="flex items-center gap-2 text-[12.5px] text-zinc-400">
                    <PackageCheck className="size-3.5 text-emerald-400" />
                    <span className="font-mono text-zinc-200">{r.code}</span> · {dmy(String(r.date).slice(0, 10))} · {formatCurrency(r.total)}{r.invoice ? ` · NF ${r.invoice}` : ""}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          {mode === "receive" ? (
            <div className="space-y-3 rounded-xl border border-white/[0.1] bg-white/[0.02] p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Nota fiscal"><input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Número da NF" className={inputCls} /></Field>
                <Field label="Data do recebimento"><input type="date" value={recDate} max={today()} onChange={(e) => setRecDate(e.target.value)} className={inputCls} /></Field>
              </div>
              <p className="text-[12px] text-zinc-500">O recebimento gera uma entrada confirmada e atualiza o saldo do local imediatamente. Itens com controle de lote/validade exigem o preenchimento.</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setMode("view")} disabled={busy} className="rounded-lg border border-white/10 px-3.5 py-2 text-[12.5px] font-medium text-zinc-300 hover:text-white">Voltar</button>
                <PrimaryButton onClick={submitReceive} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Confirmar recebimento</PrimaryButton>
              </div>
            </div>
          ) : mode === "cancel" ? (
            <div className="space-y-3 rounded-xl border border-red-500/25 bg-red-500/[0.04] p-4">
              <Field label="Motivo do cancelamento" required><input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: fornecedor sem produto" className={inputCls} /></Field>
              <div className="flex justify-end gap-2">
                <button onClick={() => setMode("view")} className="rounded-lg border border-white/10 px-3.5 py-2 text-[12.5px] font-medium text-zinc-300 hover:text-white">Voltar</button>
                <button onClick={() => act("cancel", { reason })} disabled={busy || reason.trim().length < 3} className="rounded-lg border border-red-500/30 bg-red-500/15 px-4 py-2 text-[13px] font-semibold text-red-200 disabled:opacity-50">Confirmar cancelamento</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2.5 border-t border-white/[0.06] pt-4">
              <PdfButton
                label="PDF do pedido"
                build={(print) => pdfPurchaseOrder({ org: orgName, detail: data, print })}
              />
              {o.status === "rascunho" ? (
                <>
                  <button onClick={del} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3.5 py-2.5 text-[13px] font-medium text-zinc-400 hover:text-red-300"><Trash2 className="size-4" /> Excluir</button>
                  <button onClick={() => act("send")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3.5 py-2.5 text-[13px] font-semibold text-sky-300"><Send className="size-4" /> Marcar enviado</button>
                </>
              ) : null}
              {open ? (
                <>
                  <button onClick={() => { setReason(""); setMode("cancel"); }} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3.5 py-2.5 text-[13px] font-medium text-zinc-400 hover:text-red-300"><XCircle className="size-4" /> Cancelar pedido</button>
                  <PrimaryButton onClick={() => setMode("receive")}><PackageCheck className="size-4" /> Receber mercadoria</PrimaryButton>
                </>
              ) : null}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function PriceCompareModal({ open, onClose, orgName }: { open: boolean; onClose: () => void; orgName: string }) {
  const { push } = useToast();
  const [data, setData] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState("10");
  const [onlyExp, setOnlyExp] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<PriceData>(`/api/pricing?threshold=${Number(threshold) / 100}`);
    if (r.ok) setData(r.data);
    else push({ kind: "error", title: "Não foi possível carregar os preços", msg: r.error });
    setLoading(false);
  }, [threshold, push]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const exportPdf = (print: boolean) => {
    if (!data) throw new Error("sem dados");
    const rows = onlyExp ? data.rows.filter((r) => r.expensive) : data.rows;
    const exp = data.rows.filter((r) => r.expensive);
    return pdfList({
      org: orgName,
      title: "Comparação de preços por fornecedor",
      subtitle: `Último preço pago por item contra a média do histórico · tolerância de ${threshold}%`,
      landscape: true,
      print,
      kpis: [
        { label: "Itens com histórico", value: String(data.stats.withHistory) },
        { label: "Ficaram mais caros", value: String(exp.length), tone: exp.length > 0 ? "red" : "green" },
        { label: "Economia possível", value: formatCurrency(data.stats.savingsTotal) },
        { label: "Tolerância", value: `${threshold}%` },
      ],
      columns: [
        { header: "Item", value: (r) => r.item },
        { header: "SKU", value: (r) => r.sku },
        { header: "Último fornecedor", value: (r) => r.supplier },
        { header: "Data", align: "center", value: (r) => dmy(r.date) },
        { header: "Último preço", align: "right", value: (r) => formatCurrency(r.cost) },
        { header: "Média habitual", align: "right", value: (r) => (r.usual === null ? "-" : formatCurrency(r.usual)) },
        { header: "Variação", align: "right", value: (r) => (r.deltaPct === null ? "-" : (r.deltaPct >= 0 ? "+" : "") + (r.deltaPct * 100).toFixed(1) + "%") },
        { header: "Melhor preço", align: "right", value: (r) => (r.best === null ? "-" : formatCurrency(r.best)) },
        { header: "Melhor fornecedor", value: (r) => r.bestSupplier ?? "-" },
        { header: "Economia/un.", align: "right", value: (r) => (r.savings > 0 ? formatCurrency(r.savings) : "-") },
        { header: "Compras", align: "right", value: (r) => r.compras },
      ],
      rows,
      foot: ["Total", "", "", "", "", "", "", "", "", formatCurrency(rows.reduce((a, r) => a + r.savings, 0)), ""],
      rowTone: (r) => (r.expensive ? "red" : r.deltaPct !== null && r.deltaPct <= -0.05 ? "green" : null),
      filename: "comparacao-de-precos",
      notes: [
        "Fornecedores são agrupados por nome normalizado: LTDA, ME e variações de escrita da mesma empresa contam como um só.",
        "Preços vêm dos recebimentos confirmados com nota fiscal. Ajustes de inventário e empréstimos não entram.",
        "Média habitual considera o histórico dos últimos 400 dias do item; itens com menos de 2 compras não têm comparação.",
      ],
    });
  };

  const rows = data ? (onlyExp ? data.rows.filter((r) => r.expensive) : data.rows) : [];
  const exp = data?.rows.filter((r) => r.expensive) ?? [];

  return (
    <Modal open={open} onClose={onClose} wide title="Comparação de preços por fornecedor" subtitle="Último preço pago por item contra a média do histórico — mesma empresa com razão social diferente conta como uma só">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Tolerância de variação">
            <select value={threshold} onChange={(e) => setThreshold(e.target.value)} className={`${inputCls} w-[130px]`}>
              {["5", "10", "15", "20", "30"].map((v) => (
                <option key={v} value={v} className="bg-zinc-900">{v}%</option>
              ))}
            </select>
          </Field>
          <button
            onClick={() => setOnlyExp((v) => !v)}
            className={cn("rounded-lg border px-3.5 py-2.5 text-[13px] font-medium transition", onlyExp ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-white/10 text-zinc-400 hover:text-white")}
          >
            Só o que ficou mais caro{exp.length > 0 ? ` (${exp.length})` : ""}
          </button>
          <div className="ml-auto flex gap-2">
            <PdfButton build={exportPdf} label="PDF da comparação" disabled={!data || rows.length === 0} />
          </div>
        </div>

        {loading ? (
          <LoadingRows label="Calculando variações…" />
        ) : !data || rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 p-8 text-center text-[13px] text-zinc-500">
            Ainda não há recebimentos com preço para comparar. Registre entradas com nota fiscal e o histórico se forma sozinho.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Itens analisados", String(data.stats.withHistory)],
                ["Ficaram mais caros", String(exp.length)],
                ["Economia possível", formatCurrency(data.stats.savingsTotal)],
                ["Melhor preço encontrado", exp.length ? formatCurrency(Math.max(...exp.map((r) => r.best ?? 0))) : "-"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">{k}</p>
                  <p className="mt-1 text-[16px] font-semibold text-white">{v}</p>
                </div>
              ))}
            </div>
            <div className="max-h-[52vh] overflow-y-auto rounded-xl border border-white/[0.07]">
              <table className="w-full min-w-[720px] text-left text-[12.5px]">
                <thead className="sticky top-0 bg-[#141417]">
                  <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wide text-zinc-500">
                    <th className="px-3.5 py-2.5">Item</th>
                    <th className="px-3.5 py-2.5">Último fornecedor</th>
                    <th className="px-3.5 py-2.5 text-right">Último</th>
                    <th className="px-3.5 py-2.5 text-right">Média</th>
                    <th className="px-3.5 py-2.5 text-right">Var.</th>
                    <th className="px-3.5 py-2.5 text-right">Melhor</th>
                    <th className="px-3.5 py-2.5 text-right">Economia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {rows.map((r) => (
                    <tr key={r.itemId} className={cn(r.expensive && "bg-red-500/[0.05]")}>
                      <td className="px-3.5 py-2.5">
                        <p className="font-medium text-white">{r.item}</p>
                        <p className="font-mono text-[11px] text-zinc-500">{r.sku} · {dmy(r.date)}</p>
                      </td>
                      <td className="px-3.5 py-2.5 text-zinc-300">{r.supplier}</td>
                      <td className="px-3.5 py-2.5 text-right font-semibold text-white">{formatCurrency(r.cost)}</td>
                      <td className="px-3.5 py-2.5 text-right text-zinc-400">{r.usual === null ? "—" : formatCurrency(r.usual)}</td>
                      <td className={cn("px-3.5 py-2.5 text-right font-semibold", r.deltaPct === null ? "text-zinc-500" : r.deltaPct > 0 ? "text-red-400" : "text-emerald-400")}>
                        {r.deltaPct === null ? "—" : `${r.deltaPct > 0 ? "+" : ""}${(r.deltaPct * 100).toFixed(1)}%`}
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-zinc-300">{r.best === null ? "—" : formatCurrency(r.best)}</td>
                      <td className="px-3.5 py-2.5 text-right text-emerald-300">{r.savings > 0 ? formatCurrency(r.savings) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11.5px] text-zinc-600">
              Sugestão: quando a coluna “Melhor fornecedor” diferir do último usado, cote com ele na próxima compra programada —
              a economia é por unidade e multiplica pelo volume do item.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
