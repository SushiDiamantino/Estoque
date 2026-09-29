"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Warehouse,
  CheckCircle2,
  PauseCircle,
  Plus,
  RefreshCw,
  Eye,
  Pencil,
  Power,
  Sun,
  Snowflake,
  Refrigerator,
  ChefHat,
  Truck,
  Building2,
  Globe,
} from "lucide-react";
import {
  StatCard,
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
  LoadingRows,
} from "@/components/ui";
import { PdfButton } from "@/components/PdfButton";
import { pdfList } from "@/lib/pdf/docs";
import { useToast } from "@/components/Toast";
import { useApp } from "@/components/AppContext";
import { api } from "@/lib/api";
import { formatDateBR, formatQty } from "@/lib/format";

type Loc = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  active: boolean;
  responsible: string | null;
  createdAt: string;
  itemCount: number;
  totalQty: number;
};

const TYPE_META: Record<string, { label: string; icon: typeof Sun }> = {
  ambiente: { label: "Ambiente", icon: Sun },
  refrigerado: { label: "Refrigerado", icon: Refrigerator },
  congelado: { label: "Congelado", icon: Snowflake },
  cozinha: { label: "Cozinha", icon: ChefHat },
  delivery: { label: "Delivery", icon: Truck },
  externo: { label: "Externo", icon: Globe },
};

export default function LocaisPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Carregando…</div>}>
      <LocaisInner />
    </Suspense>
  );
}

function LocaisInner() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const { push } = useToast();
  const { org } = useApp();
  const [rows, setRows] = useState<Loc[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(initialQ);
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [modal, setModal] = useState<null | { mode: "create" | "edit"; row?: Loc }>(null);
  const [view, setView] = useState<Loc | null>(null);
  const [page, setPage] = useState(1);
  const perPage = 8;

  const load = useCallback(async () => {    setLoading(true);
    const r = await api<{ locations: Loc[]; stats: typeof stats }>(
      `/api/locations?q=${encodeURIComponent(q)}&type=${type}&status=${status}`
    );
    if (r.ok) {
      setRows(r.data.locations ?? []);
      setStats(r.data.stats ?? { total: 0, active: 0, inactive: 0 });
    } else {
      push({ kind: "error", title: "Não foi possível carregar os locais", msg: r.error });
    }
    setLoading(false);
  }, [q, type, status, push]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    setQ(initialQ);
  }, [initialQ]);

  useEffect(() => {
    setPage(1);
  }, [q, type, status]);

  const toggle = async (row: Loc) => {
    const res = await fetch(`/api/locations/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !row.active }),
    });
    if (res.ok) {
      push({ kind: "success", title: row.active ? "Local inativado" : "Local ativado" });
      load();
    }
  };

  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  const paged = rows.slice((page - 1) * perPage, page * perPage);

  const exportPdf = (print: boolean) =>
    pdfList<Loc>({
      org: org.name,
      title: "Locais de armazenamento",
      subtitle: "Endereços internos e saldo consolidado.",
      print,
      kpis: [
        { label: "Total de locais", value: String(stats.total) },
        { label: "Ativos", value: String(stats.active) },
        { label: "Inativos", value: String(stats.inactive) },
      ],
      columns: [
        { header: "Local", value: (r) => r.name },
        { header: "Tipo", value: (r) => r.type },
        { header: "Responsável", value: (r) => r.responsible ?? "-" },
        { header: "SKUs", align: "right", value: (r) => r.itemCount },
        { header: "Saldo total", align: "right", value: (r) => formatQty(r.totalQty) },
        { header: "Situação", align: "center", value: (r) => (r.active ? "Ativo" : "Inativo") },
      ],
      rows,
      filename: "locais-de-armazenamento",
    });

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-bold tracking-tight text-white">
            Locais de armazenamento
          </h2>
          <p className="mt-1.5 text-[13.5px] text-zinc-400">
            Organize os espaços. Mantenha cada estoque no seu lugar.
          </p>
        </div>
        <PdfButton build={exportPdf} disabled={rows.length === 0} />
        <PrimaryButton onClick={() => setModal({ mode: "create" })}>
          <Plus className="size-4" /> Novo local
        </PrimaryButton>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total de locais" value={stats.total} hint="Espaços físicos cadastrados" icon={<Warehouse className="size-4" />} />
        <StatCard label="Locais ativos" value={stats.active} hint="Disponíveis para a operação" icon={<CheckCircle2 className="size-4" />} accent={<span className="size-1.5 rounded-full bg-emerald-400" />} />
        <StatCard label="Locais inativos" value={stats.inactive} hint="Histórico e vínculos preservados" icon={<PauseCircle className="size-4" />} />
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#141417]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div>
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-white">
              Locais cadastrados
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-300">{rows.length}</span>
            </h3>
            <p className="mt-0.5 text-[12.5px] text-zinc-500">Os endereços internos da sua operação.</p>
          </div>
          <button onClick={load} className="flex items-center gap-1.5 text-[12.5px] font-medium text-zinc-400 transition hover:text-white">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>

        <div className="flex flex-col gap-2.5 px-5 py-4 lg:flex-row">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por nome ou descrição…" />
          <div className="flex gap-2.5">
            <Select
              value={type}
              onChange={setType}
              className="min-w-[170px] flex-1 lg:w-[190px]"
              options={[
                { value: "all", label: "Todos os tipos" },
                { value: "ambiente", label: "Ambiente" },
                { value: "refrigerado", label: "Refrigerado" },
                { value: "congelado", label: "Congelado" },
                { value: "cozinha", label: "Cozinha" },
                { value: "delivery", label: "Delivery" },
                { value: "externo", label: "Externo" },
              ]}
            />
            <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#1a1a1f] p-1 text-[12px] font-medium">
              {[
                { v: "all", l: `Todos ${stats.total}` },
                { v: "active", l: `Ativos ${stats.active}` },
                { v: "inactive", l: `Inativos ${stats.inactive}` },
              ].map((t) => (
                <button
                  key={t.v}
                  onClick={() => setStatus(t.v)}
                  className={`whitespace-nowrap rounded-md px-2.5 py-1.5 transition ${
                    status === t.v ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {t.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <LoadingRows label="Carregando locais…" />
        ) : (
          <>
            <TableShell
              head={
                <>
                  <Th>Local de armazenamento ⇅</Th>
                  <Th>Tipo</Th>
                  <Th>Saldo</Th>
                  <Th>Status</Th>
                  <Th>Criado em</Th>
                  <Th className="text-right">Ações</Th>
                </>
              }
              empty={paged.length === 0}
            >
              {paged.length === 0 ? (
                <EmptyState
                  icon={<Warehouse className="size-7" />}
                  title="Nenhum local encontrado"
                  description="Cadastre o primeiro endereço interno para começar a distribuir o estoque."
                  action={
                    <PrimaryButton onClick={() => setModal({ mode: "create" })}>
                      <Plus className="size-4" /> Novo local
                    </PrimaryButton>
                  }
                />
              ) : (
                paged.map((l) => {
                  const meta = TYPE_META[l.type] ?? { label: l.type, icon: Building2 };
                  const Icon = meta.icon;
                  return (
                    <tr key={l.id} className="transition hover:bg-white/[0.02]">
                      <Td>
                        <div className="flex items-center gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-zinc-300">
                            <Icon className="size-[18px]" />
                          </span>
                          <div className="min-w-0 max-w-[320px]">
                            <p className="truncate text-[13.5px] font-semibold text-white">{l.name}</p>
                            <p className="line-clamp-1 text-[12px] text-zinc-500">
                              {l.description || "Sem descrição"}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11.5px] font-medium text-zinc-300">
                          <Icon className="size-3.5 text-zinc-500" />
                          {meta.label}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[12.5px] text-zinc-300">
                          {formatQty(l.totalQty)} un. · {l.itemCount} SKU(s)
                        </span>
                      </Td>
                      <Td>
                        {l.active ? <StatusPill tone="green">Ativo</StatusPill> : <StatusPill tone="gray">Inativo</StatusPill>}
                      </Td>
                      <Td>
                        <span className="whitespace-nowrap text-[13px] text-zinc-400">{formatDateBR(l.createdAt)}</span>
                      </Td>
                      <Td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button title="Ver" onClick={() => setView(l)} className="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"><Eye className="size-4" /></button>
                          <button title="Editar" onClick={() => setModal({ mode: "edit", row: l })} className="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"><Pencil className="size-4" /></button>
                          <button title={l.active ? "Inativar" : "Ativar"} onClick={() => toggle(l)} className="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"><Power className="size-4" /></button>
                        </div>
                      </Td>
                    </tr>
                  );
                })
              )}
            </TableShell>
            <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-3.5 text-[12.5px] text-zinc-500">
              <p>
                Mostrando{" "}
                <strong className="text-zinc-300">
                  {rows.length === 0 ? 0 : (page - 1) * perPage + 1}–
                  {Math.min(page * perPage, rows.length)}
                </strong>{" "}
                de <strong className="text-zinc-300">{rows.length}</strong> locais
              </p>
              <div className="flex items-center gap-2">
                <span>Página {page} de {totalPages}</span>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="grid size-7 place-items-center rounded-lg border border-white/10 text-zinc-400 disabled:opacity-40"
                >
                  ‹
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="grid size-7 place-items-center rounded-lg border border-white/10 text-zinc-400 disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <LocalModal modal={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />

      <Modal open={!!view} onClose={() => setView(null)} title={view?.name ?? ""} subtitle="Detalhes do local">
        {view ? (
          <div className="space-y-4 text-[13px]">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 leading-relaxed text-zinc-400">
              {view.description || "Sem descrição."}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/[0.07] p-3.5">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Tipo</p>
                <p className="mt-1 font-semibold text-white">{TYPE_META[view.type]?.label ?? view.type}</p>
              </div>
              <div className="rounded-xl border border-white/[0.07] p-3.5">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Responsável</p>
                <p className="mt-1 font-semibold text-white">{view.responsible || "—"}</p>
              </div>
              <div className="rounded-xl border border-white/[0.07] p-3.5">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Saldo</p>
                <p className="mt-1 font-semibold text-white">{formatQty(view.totalQty)} un.</p>
              </div>
              <div className="rounded-xl border border-white/[0.07] p-3.5">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">SKUs</p>
                <p className="mt-1 font-semibold text-white">{view.itemCount}</p>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function LocalModal({
  modal,
  onClose,
  onSaved,
}: {
  modal: null | { mode: "create" | "edit"; row?: Loc };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { push } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("ambiente");
  const [responsible, setResponsible] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (modal?.mode === "edit" && modal.row) {
      setName(modal.row.name);
      setDescription(modal.row.description ?? "");
      setType(modal.row.type);
      setResponsible(modal.row.responsible ?? "");
    } else if (modal?.mode === "create") {
      setName("");
      setDescription("");
      setType("ambiente");
      setResponsible("");
    }
  }, [modal]);

  if (!modal) return null;

  const save = async () => {
    if (!name.trim()) {
      push({ kind: "error", title: "Informe o nome do local" });
      return;
    }
    setSaving(true);
    try {
      const url = modal.mode === "create" ? "/api/locations" : `/api/locations/${modal.row?.id}`;
      const res = await fetch(url, {
        method: modal.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, type, responsible }),
      });
      if (res.ok) {
        push({ kind: "success", title: modal.mode === "create" ? "Local criado" : "Local atualizado", msg: name.trim() });
        onSaved();
      } else {
        push({ kind: "error", title: "Erro ao salvar local" });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={modal.mode === "create" ? "Novo local" : "Editar local"} subtitle="Endereço interno da operação">
      <div className="space-y-4">
        <Field label="Nome do local" required>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Câmara Fria 01" className={inputCls} />
        </Field>
        <Field label="Descrição">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="O que é armazenado neste espaço?" className={`${inputCls} resize-none`} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo de armazenamento" required>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
              <option value="ambiente" className="bg-zinc-900">Ambiente</option>
              <option value="refrigerado" className="bg-zinc-900">Refrigerado</option>
              <option value="congelado" className="bg-zinc-900">Congelado</option>
              <option value="cozinha" className="bg-zinc-900">Cozinha</option>
              <option value="delivery" className="bg-zinc-900">Delivery</option>
              <option value="externo" className="bg-zinc-900">Externo</option>
            </select>
          </Field>
          <Field label="Responsável">
            <input value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="Ex.: Cozinha fria" className={inputCls} />
          </Field>
        </div>
        <div className="flex justify-end gap-2.5 pt-1">
          <button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2.5 text-[13px] font-medium text-zinc-300 hover:text-white">Cancelar</button>
          <PrimaryButton onClick={save} disabled={saving}>{saving ? "Salvando…" : modal.mode === "create" ? "Criar local" : "Salvar alterações"}</PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
