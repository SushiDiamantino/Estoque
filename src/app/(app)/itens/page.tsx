"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Package,
  CheckCircle2,
  Barcode,
  CalendarClock,
  Plus,
  RefreshCw,
  Pencil,
  Power,
  Trash2,
  BookOpen,
  SlidersHorizontal,
  Boxes,
  Eye,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
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
  Toggle,
} from "@/components/ui";
import { PdfButton } from "@/components/PdfButton";
import { pdfList } from "@/lib/pdf/docs";
import { useToast } from "@/components/Toast";
import { useApp } from "@/components/AppContext";
import { api } from "@/lib/api";
import { formatDateBR, formatQty } from "@/lib/format";

type Item = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  unit: string;
  minStock: string;
  lotControl: boolean;
  expiryControl: boolean;
  active: boolean;
  costPrice: string;
  totalQty: number | string;
};
type Category = { id: string; name: string };
type Stats = { total: number; active: number; inactive: number; lot: number; expiry: number };

const EMPTY_STATS: Stats = { total: 0, active: 0, inactive: 0, lot: 0, expiry: 0 };
const UNITS = ["un", "kg", "g", "L", "ml", "cx", "pct", "saco", "fardo", "pote", "bloco", "peça"];
const NO_EXTRA = { low: false, lot: false, expiry: false, noCategory: false };
const EXTRA_LABELS: Record<keyof typeof NO_EXTRA, string> = {
  low: "Abaixo do mínimo",
  lot: "Com controle de lote",
  expiry: "Com controle de validade",
  noCategory: "Sem categoria",
};

export default function ItensPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Carregando…</div>}>
      <ItensInner />
    </Suspense>
  );
}

function ItensInner() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const { push } = useToast();
  const { org } = useApp();
  const [rows, setRows] = useState<Item[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(initialQ);
  const [category, setCategory] = useState("all");
  const [unit, setUnit] = useState("all");
  const [status, setStatus] = useState("all");
  const [extra, setExtra] = useState(NO_EXTRA);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modal, setModal] = useState<null | { mode: "create" | "edit"; row?: Item }>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [detail, setDetail] = useState<Item | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<{ items: Item[]; stats: Stats }>(
      `/api/items?q=${encodeURIComponent(q)}&category=${category}&unit=${unit}&status=${status}`
    );
    if (r.ok) {
      setRows(r.data.items ?? []);
      setStats(r.data.stats ?? EMPTY_STATS);
    } else {
      push({ kind: "error", title: "Não foi possível carregar os itens", msg: r.error });
    }
    setLoading(false);
  }, [q, category, unit, status, push]);

  const loadCats = useCallback(async () => {
    const r = await api<{ categories: Category[] }>("/api/categories?status=active");
    if (r.ok) setCats((r.data.categories ?? []).map((c) => ({ id: c.id, name: c.name })));
  }, []);

  useEffect(() => {
    loadCats();
  }, [loadCats]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    setQ(initialQ);
  }, [initialQ]);

  const visible = useMemo(
    () =>
      rows.filter((it) => {
        if (extra.low && !(Number(it.minStock) > 0 && Number(it.totalQty) < Number(it.minStock))) return false;
        if (extra.lot && !it.lotControl) return false;
        if (extra.expiry && !it.expiryControl) return false;
        if (extra.noCategory && it.categoryId) return false;
        return true;
      }),
    [rows, extra]
  );
  const extraCount = Object.values(extra).filter(Boolean).length;
  const hasAnyFilter = !!q || category !== "all" || unit !== "all" || status !== "all" || extraCount > 0;

  const clearAll = () => {
    setQ("");
    setCategory("all");
    setUnit("all");
    setStatus("all");
    setExtra(NO_EXTRA);
  };

  const toggle = async (row: Item) => {
    const r = await api(`/api/items/${row.id}`, { method: "PATCH", json: { active: !row.active } });
    if (r.ok) {
      push({ kind: "success", title: row.active ? "Item inativado" : "Item ativado", msg: row.name });
      load();
    } else {
      push({ kind: "error", title: "Não foi possível alterar o status", msg: r.error });
    }
  };

  const remove = async (row: Item) => {
    if (!confirm(`Excluir "${row.name}"? Itens com movimentações não podem ser excluídos.`)) return;
    const r = await api(`/api/items/${row.id}`, { method: "DELETE" });
    if (r.ok) {
      push({ kind: "success", title: "Item excluído" });
      load();
    } else {
      push({ kind: "error", title: "Não foi possível excluir", msg: r.error });
    }
  };

  const exportPdf = (print: boolean) =>
    pdfList<Item>({
      org: org.name,
      title: "Catálogo de itens",
      subtitle: "Insumos e materiais cadastrados, com saldo, mínimo e controles.",
      landscape: true,
      print,
      kpis: [
        { label: "Itens cadastrados", value: String(stats.total) },
        { label: "Ativos", value: String(stats.active) },
        { label: "Controle de lote", value: String(stats.lot) },
        { label: "Controle de validade", value: String(stats.expiry) },
      ],
      columns: [
        { header: "Item", value: (r) => r.name },
        { header: "SKU", value: (r) => r.sku },
        { header: "Categoria", value: (r) => r.categoryName ?? "-" },
        { header: "Un.", align: "center", value: (r) => r.unit },
        { header: "Saldo", align: "right", value: (r) => formatQty(r.totalQty) },
        { header: "Mínimo", align: "right", value: (r) => formatQty(r.minStock) },
        { header: "Custo", align: "right", value: (r) => Number(r.costPrice).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
        { header: "Controles", value: (r) => [r.lotControl ? "Lote" : "", r.expiryControl ? "Validade" : ""].filter(Boolean).join(" + ") || "-" },
        { header: "Situação", align: "center", value: (r) => (r.active ? "Ativo" : "Inativo") },
      ],
      rows: visible,
      rowTone: (r) => (Number(r.minStock) > 0 && Number(r.totalQty) < Number(r.minStock) ? "red" : null),
      filename: "catalogo-de-itens",
    });

  return (
    <div className="animate-fade-in">
      <p className="text-[12px] text-zinc-500">
        Operação <span className="mx-1.5 text-zinc-700">›</span> <span className="text-zinc-300">Itens</span>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-[28px] font-bold tracking-tight text-white">Itens</h2>
            <PageBadge>Insumos e materiais</PageBadge>
          </div>
          <p className="mt-1.5 text-[13.5px] text-zinc-400">Tudo que sua operação utiliza, organizado em um só lugar.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={() => setGuideOpen(true)} className="inline-flex items-center gap-2 px-2 py-2 text-[13px] font-medium text-zinc-400 transition hover:text-white">
            <BookOpen className="size-4" /> Guia de cadastro
          </button>
          <PdfButton build={exportPdf} disabled={visible.length === 0} />
          <PrimaryButton onClick={() => setModal({ mode: "create" })}>
            <Plus className="size-4" /> Novo item
          </PrimaryButton>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Itens cadastrados" value={stats.total} hint="Insumos e materiais da operação" icon={<Boxes className="size-4" />} />
        <StatCard label="Itens ativos" value={stats.active} hint="Disponíveis para utilização" icon={<CheckCircle2 className="size-4" />} />
        <StatCard label="Controle de lote" value={stats.lot} hint="Itens com rastreabilidade por lote" icon={<Barcode className="size-4" />} />
        <StatCard label="Controle de validade" value={stats.expiry} hint="Itens com acompanhamento de validade" icon={<CalendarClock className="size-4" />} />
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#141417]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div>
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-white">
              Catálogo de itens
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-300">{visible.length}</span>
            </h3>
            <p className="mt-0.5 text-[12.5px] text-zinc-500">Gerencie os insumos e materiais da operação.</p>
          </div>
          <button onClick={load} className="flex items-center gap-1.5 text-[12.5px] font-medium text-zinc-400 transition hover:text-white">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>

        <div className="flex flex-col gap-2.5 px-5 py-4 xl:flex-row">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por nome, SKU ou código de barras…" />
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Select value={category} onChange={setCategory} className="sm:w-[200px]" options={[{ value: "all", label: "Todas as categorias" }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} />
            <Select value={unit} onChange={setUnit} className="sm:w-[170px]" options={[{ value: "all", label: "Todas as unidades" }, ...UNITS.map((u) => ({ value: u, label: u }))]} />
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-[13px] font-medium transition ${
                filtersOpen || extraCount > 0 ? "border-white/25 bg-white/[0.06] text-white" : "border-white/[0.08] bg-[#1a1a1f] text-zinc-300 hover:border-white/15 hover:text-white"
              }`}
            >
              <SlidersHorizontal className="size-4" /> Filtros
              {extraCount > 0 ? <span className="rounded-md bg-white/15 px-1.5 text-[11px] font-semibold">{extraCount}</span> : null}
            </button>
          </div>
        </div>

        {filtersOpen ? (
          <div className="animate-fade-in mx-5 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
            <span className="mr-1 text-[12px] font-medium text-zinc-500">Filtros rápidos:</span>
            {(Object.keys(NO_EXTRA) as (keyof typeof NO_EXTRA)[]).map((k) => (
              <button
                key={k}
                onClick={() => setExtra((e) => ({ ...e, [k]: !e[k] }))}
                className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition ${extra[k] ? "border-white/25 bg-white/10 text-white" : "border-white/10 text-zinc-400 hover:text-white"}`}
              >
                {EXTRA_LABELS[k]}
              </button>
            ))}
            {hasAnyFilter ? (
              <button onClick={clearAll} className="ml-auto text-[12.5px] text-zinc-500 hover:text-white">Limpar tudo</button>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 pr-5">
          <div className="min-w-0 flex-1">
            <Tabs
              active={status}
              onChange={setStatus}
              tabs={[
                { value: "all", label: "Todos os itens", count: stats.total },
                { value: "active", label: "Ativos", count: stats.active },
                { value: "inactive", label: "Inativos", count: stats.inactive },
              ]}
            />
          </div>
          <p className="hidden shrink-0 text-[11.5px] text-zinc-600 md:block">Cadastro único por item</p>
        </div>

        {loading && rows.length === 0 ? (
          <LoadingRows label="Carregando itens…" />
        ) : (
          <div className={loading ? "opacity-60 transition" : "transition"}>
            <TableShell
              head={
                <>
                  <Th>Item / SKU ⇅</Th>
                  <Th>Categoria</Th>
                  <Th>Unidade</Th>
                  <Th>Saldo</Th>
                  <Th>Est. mínimo</Th>
                  <Th>Controles</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Ações</Th>
                </>
              }
              empty={visible.length === 0}
            >
              {visible.length === 0 && hasAnyFilter ? (
                <EmptyState
                  icon={<Package className="size-7" />}
                  title="Nenhum item encontrado"
                  description="Nenhum item corresponde à busca ou aos filtros aplicados."
                  action={
                    <button onClick={clearAll} className="rounded-lg border border-white/10 px-4 py-2.5 text-[13px] font-medium text-zinc-300 hover:text-white">
                      Limpar filtros
                    </button>
                  }
                />
              ) : visible.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-14 text-center">
                  <div className="relative">
                    <div className="grid size-[68px] place-items-center rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#2a2a31] to-[#1c1c21] text-zinc-200">
                      <Package className="size-7" />
                    </div>
                    <span className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-lg border border-white/10 bg-[#232329] text-zinc-400">
                      <Barcode className="size-3.5" />
                    </span>
                    <span className="absolute -bottom-2 -left-2 grid size-7 place-items-center rounded-lg border border-white/10 bg-[#232329] text-emerald-400">
                      <CheckCircle2 className="size-3.5" />
                    </span>
                  </div>
                  <h3 className="mt-5 text-[16px] font-semibold text-white">Seu estoque começa com um bom cadastro</h3>
                  <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-zinc-500">
                    Organize os insumos e materiais do restaurante. Cadastre o primeiro item para começar.
                  </p>
                  <div className="mt-5">
                    <PrimaryButton onClick={() => setModal({ mode: "create" })}>
                      <Plus className="size-4" /> Cadastrar primeiro item
                    </PrimaryButton>
                  </div>
                </div>
              ) : (
                visible.map((it) => {
                  const low = Number(it.minStock) > 0 && Number(it.totalQty) < Number(it.minStock);
                  return (
                    <tr key={it.id} className="transition hover:bg-white/[0.02]">
                      <Td>
                        <button onClick={() => setDetail(it)} className="min-w-0 max-w-[260px] text-left">
                          <p className="truncate text-[13.5px] font-semibold text-white hover:underline">{it.name}</p>
                          <p className="mt-0.5 font-mono text-[11.5px] text-zinc-500">{it.sku}</p>
                        </button>
                      </Td>
                      <Td>
                        {it.categoryName ? (
                          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-zinc-300">
                            <span className="size-2 rounded-full" style={{ backgroundColor: it.categoryColor ?? "#71717a" }} />
                            {it.categoryName}
                          </span>
                        ) : (
                          <span className="text-[12.5px] text-zinc-600">—</span>
                        )}
                      </Td>
                      <Td>
                        <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[11.5px] text-zinc-300">{it.unit}</span>
                      </Td>
                      <Td>
                        <span className={`text-[13px] font-semibold ${low ? "text-red-400" : "text-zinc-100"}`} title={low ? "Abaixo do estoque mínimo" : undefined}>
                          {formatQty(it.totalQty)}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[12.5px] text-zinc-400">{formatQty(it.minStock)}</span>
                      </Td>
                      <Td>
                        <div className="flex gap-1.5">
                          {it.lotControl ? (
                            <span title="Controle de lote" className="grid size-7 place-items-center rounded-lg border border-sky-500/20 bg-sky-500/10 text-sky-300"><Barcode className="size-3.5" /></span>
                          ) : null}
                          {it.expiryControl ? (
                            <span title="Controle de validade" className="grid size-7 place-items-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300"><CalendarClock className="size-3.5" /></span>
                          ) : null}
                          {!it.lotControl && !it.expiryControl ? <span className="text-[12px] text-zinc-600">—</span> : null}
                        </div>
                      </Td>
                      <Td>{it.active ? <StatusPill tone="green">Ativo</StatusPill> : <StatusPill tone="gray">Inativo</StatusPill>}</Td>
                      <Td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <IconBtn title="Ver saldo e histórico" onClick={() => setDetail(it)}><Eye className="size-4" /></IconBtn>
                          <IconBtn title="Editar" onClick={() => setModal({ mode: "edit", row: it })}><Pencil className="size-4" /></IconBtn>
                          <IconBtn title={it.active ? "Inativar" : "Ativar"} onClick={() => toggle(it)}><Power className="size-4" /></IconBtn>
                          <IconBtn title="Excluir" danger onClick={() => remove(it)}><Trash2 className="size-4" /></IconBtn>
                        </div>
                      </Td>
                    </tr>
                  );
                })
              )}
            </TableShell>
          </div>
        )}
      </div>

      <ItemModal modal={modal} cats={cats} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      <ItemDetail item={detail} onClose={() => setDetail(null)} />

      <Modal open={guideOpen} onClose={() => setGuideOpen(false)} title="Guia de cadastro" subtitle="Como manter um catálogo saudável" wide>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { t: "1 · Nome padronizado", d: "Use padrão 'Produto — apresentação'. Ex.: Arroz para sushi — saco 20kg." },
            { t: "2 · SKU único", d: "Deixe o sistema gerar ou use o código do fornecedor. Evite duplicar." },
            { t: "3 · Categoria correta", d: "Cada item pertence a exatamente uma categoria operacional." },
            { t: "4 · Estoque mínimo", d: "Defina o mínimo para receber alertas automáticos de reposição." },
            { t: "5 · Lote e validade", d: "Ative para pescados, perecíveis e itens com rastreabilidade. A entrada passa a exigir lote/validade." },
            { t: "6 · Unidade consistente", d: "Cadastre na unidade de consumo (kg, un, pote) para baixas corretas." },
          ].map((g) => (
            <div key={g.t} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
              <p className="text-[13.5px] font-semibold text-white">{g.t}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-500">{g.d}</p>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button title={title} aria-label={title} onClick={onClick} className={`grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] ${danger ? "hover:text-red-400" : "hover:text-white"}`}>
      {children}
    </button>
  );
}

function ItemModal({
  modal,
  cats,
  onClose,
  onSaved,
}: {
  modal: null | { mode: "create" | "edit"; row?: Item };
  cats: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { push } = useToast();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unit, setUnit] = useState("un");
  const [minStock, setMinStock] = useState("0");
  const [costPrice, setCostPrice] = useState("0");
  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [lotControl, setLotControl] = useState(false);
  const [expiryControl, setExpiryControl] = useState(false);
  const [perishable, setPerishable] = useState(false);
  const [leadTime, setLeadTime] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!modal) return;
    if (modal.mode === "edit" && modal.row) {
      const r = modal.row;
      setName(r.name);
      setSku(r.sku);
      setCategoryId(r.categoryId ?? "");
      setUnit(r.unit);
      setMinStock(String(Number(r.minStock)));
      setCostPrice(String(Number(r.costPrice)));
      setLotControl(r.lotControl);
      setExpiryControl(r.expiryControl);
      setBarcode("");
      setSupplier("");
      setDescription("");
      setPerishable(false);
      setLeadTime("0");
      api<{ item: { barcode: string | null; supplier: string | null; description: string | null; perishable: boolean; leadTimeDays: number | null } }>(`/api/items/${r.id}`).then((res) => {
        if (res.ok && res.data.item) {
          setLeadTime(String(res.data.item.leadTimeDays ?? 0));
          setBarcode(res.data.item.barcode ?? "");
          setSupplier(res.data.item.supplier ?? "");
          setDescription(res.data.item.description ?? "");
          setPerishable(Boolean(res.data.item.perishable));
        }
      });
    } else {
      setName(""); setSku(""); setBarcode(""); setCategoryId("");
      setUnit("un"); setMinStock("0"); setCostPrice("0"); setSupplier("");
      setDescription(""); setLotControl(false); setExpiryControl(false); setPerishable(false); setLeadTime("0");
    }
  }, [modal]);

  if (!modal) return null;

  const save = async () => {
    if (saving) return;
    if (!name.trim()) {
      push({ kind: "error", title: "Informe o nome do item" });
      return;
    }
    if (Number(minStock) < 0 || Number.isNaN(Number(minStock))) {
      push({ kind: "error", title: "Estoque mínimo inválido" });
      return;
    }
    setSaving(true);
    const url = modal.mode === "create" ? "/api/items" : `/api/items/${modal.row?.id}`;
    const r = await api(url, {
      method: modal.mode === "create" ? "POST" : "PATCH",
      json: {
        name, sku: sku || undefined, barcode, categoryId: categoryId || null,
        unit, minStock, costPrice, supplier, description,
        lotControl, expiryControl, perishable, leadTimeDays: Number(leadTime) || 0,
      },
    });
    setSaving(false);
    if (r.ok) {
      push({ kind: "success", title: modal.mode === "create" ? "Item cadastrado" : "Item atualizado", msg: name.trim() });
      onSaved();
    } else {
      push({ kind: "error", title: "Não foi possível salvar", msg: r.error });
    }
  };

  return (
    <Modal open onClose={saving ? () => {} : onClose} title={modal.mode === "create" ? "Novo item" : "Editar item"} subtitle="Cadastro único de insumo ou material" wide>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_220px]">
          <Field label="Nome do item" required hint="Padrão sugerido: Produto — apresentação">
            <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Salmão fresco — peça inteira" className={inputCls} />
          </Field>
          <Field label="SKU" hint={modal.mode === "create" ? "Vazio = automático" : "Único por item"}>
            <input value={sku} maxLength={40} onChange={(e) => setSku(e.target.value)} placeholder="Auto" className={`${inputCls} font-mono uppercase`} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Categoria">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
              <option value="" className="bg-zinc-900">Sem categoria</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id} className="bg-zinc-900">{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Unidade" required>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls}>
              {UNITS.map((u) => (
                <option key={u} value={u} className="bg-zinc-900">{u}</option>
              ))}
            </select>
          </Field>
          <Field label="Código de barras">
            <input value={barcode} maxLength={64} onChange={(e) => setBarcode(e.target.value)} placeholder="EAN / interno" className={`${inputCls} font-mono`} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Estoque mínimo" hint="Gera alerta automático">
            <input type="number" inputMode="decimal" min="0" step="0.001" value={minStock} onChange={(e) => setMinStock(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Custo médio (R$)" hint="Usado nos relatórios e sugerido nas entradas">
            <input type="number" inputMode="decimal" min="0" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Fornecedor padrão">
            <input value={supplier} maxLength={120} onChange={(e) => setSupplier(e.target.value)} placeholder="Ex.: Peixaria Central" className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Prazo de entrega (dias)" hint="Usado na sugestão de compra dos relatórios">
            <input type="number" inputMode="numeric" min="0" max="90" step="1" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Descrição / observações">
          <textarea value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Detalhes de armazenamento, rendimento…" className={`${inputCls} resize-none`} />
        </Field>
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 sm:grid-cols-3">
          <Toggle checked={lotControl} onChange={setLotControl} label="Controle de lote" />
          <Toggle checked={expiryControl} onChange={setExpiryControl} label="Controle de validade" />
          <Toggle checked={perishable} onChange={setPerishable} label="Perecível" />
        </div>
        <div className="flex justify-end gap-2.5 pt-1">
          <button onClick={onClose} disabled={saving} className="rounded-lg border border-white/10 px-4 py-2.5 text-[13px] font-medium text-zinc-300 hover:text-white disabled:opacity-50">Cancelar</button>
          <PrimaryButton onClick={save} disabled={saving}>{saving ? "Salvando…" : modal.mode === "create" ? "Cadastrar item" : "Salvar alterações"}</PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

type ItemDetailData = {
  item: { id: string; name: string; sku: string; unit: string; minStock: string; supplier: string | null; description: string | null };
  balances: { locationId: string; locationName: string; locationType: string; quantity: string; updatedAt: string }[];
  history: { movementId: string; code: string; type: string; status: string; reason: string | null; movementDate: string; quantity: string; lotCode: string | null; expiryDate: string | null }[];
};

function ItemDetail({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const [data, setData] = useState<ItemDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    if (!item) return;
    let alive = true;
    api<ItemDetailData>(`/api/items/${item.id}`).then((r) => {
      if (!alive) return;
      if (r.ok) setData(r.data);
      else setError(r.error ?? "Erro ao carregar");
    });
    return () => {
      alive = false;
    };
  }, [item]);

  if (!item) return null;
  const total = (data?.balances ?? []).reduce((a, b) => a + Number(b.quantity), 0);
  const min = Number(item.minStock);
  const coverage = min > 0 ? Math.min(100, Math.round((total / min) * 100)) : 100;
  const withStock = (data?.balances ?? []).filter((b) => Number(b.quantity) !== 0);

  return (
    <Modal open onClose={onClose} wide title={item.name} subtitle={`${item.sku} · ${item.unit}${item.categoryName ? ` · ${item.categoryName}` : ""}`}>
      {error ? (
        <p className="py-8 text-center text-[13px] text-red-300">{error}</p>
      ) : !data ? (
        <LoadingRows label="Carregando saldo…" />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/[0.07] p-4">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Saldo total</p>
              <p className="mt-1 text-[22px] font-semibold text-white">{formatQty(total)} <span className="text-[13px] font-normal text-zinc-500">{item.unit}</span></p>
            </div>
            <div className="rounded-xl border border-white/[0.07] p-4">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Estoque mínimo</p>
              <p className="mt-1 text-[22px] font-semibold text-white">{formatQty(min)} <span className="text-[13px] font-normal text-zinc-500">{item.unit}</span></p>
            </div>
            <div className="rounded-xl border border-white/[0.07] p-4">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Cobertura do mínimo</p>
              <p className={`mt-1 text-[22px] font-semibold ${min > 0 && total < min ? "text-red-400" : "text-emerald-300"}`}>{min > 0 ? `${coverage}%` : "—"}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div className={`h-full rounded-full ${min > 0 && total < min ? "bg-red-500" : "bg-emerald-400"}`} style={{ width: `${coverage}%` }} />
              </div>
            </div>
          </div>

          {data.item.supplier || data.item.description ? (
            <p className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5 text-[12.5px] text-zinc-400">
              {data.item.supplier ? <><span className="text-zinc-300">Fornecedor:</span> {data.item.supplier}</> : null}
              {data.item.supplier && data.item.description ? " · " : ""}
              {data.item.description}
            </p>
          ) : null}

          <div>
            <p className="mb-2 text-[12.5px] font-semibold text-zinc-300">Saldo por local</p>
            {withStock.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-[12.5px] text-zinc-500">
                Sem saldo em nenhum local. Registre uma entrada para este item.
              </p>
            ) : (
              <div className="space-y-2">
                {withStock.map((b) => (
                  <div key={b.locationId} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.015] px-4 py-2.5 text-[13px]">
                    <span className="font-medium text-zinc-200">{b.locationName}</span>
                    <span className={`font-semibold ${Number(b.quantity) < 0 ? "text-red-300" : "text-white"}`}>{formatQty(b.quantity)} {item.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-[12.5px] font-semibold text-zinc-300">Últimas movimentações</p>
            {data.history.length === 0 ? (
              <p className="text-[12.5px] text-zinc-500">Nenhuma movimentação registrada.</p>
            ) : (
              <div className="divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.07]">
                {data.history.map((h, i) => {
                  const Icon = h.type === "entrada" ? ArrowDownToLine : h.type === "saida" ? ArrowUpFromLine : ArrowLeftRight;
                  const sign = h.type === "entrada" ? "+" : h.type === "saida" ? "−" : "↔";
                  return (
                    <div key={`${h.movementId}-${i}`} className={`flex items-center gap-3 px-4 py-2.5 text-[12.5px] ${h.status !== "confirmada" ? "opacity-60" : ""}`}>
                      <Icon className="size-4 shrink-0 text-zinc-500" />
                      <span className="font-mono text-zinc-300">{h.code}</span>
                      <span className="hidden truncate text-zinc-500 sm:inline">{h.reason ?? ""}{h.lotCode ? ` · lote ${h.lotCode}` : ""}</span>
                      <span className="ml-auto shrink-0 text-zinc-500">{formatDateBR(h.movementDate)}</span>
                      <span className={`w-20 shrink-0 text-right font-semibold ${h.type === "entrada" ? "text-emerald-300" : h.type === "saida" ? "text-amber-300" : "text-sky-300"}`}>
                        {sign} {formatQty(h.quantity)}
                      </span>
                      <span className="w-20 shrink-0 text-right text-[11px] text-zinc-500">{h.status}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
