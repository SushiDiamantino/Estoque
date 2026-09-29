"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Tags,
  CheckCircle2,
  PauseCircle,
  PackageX,
  Plus,
  RefreshCw,
  Eye,
  Pencil,
  Power,
  Trash2,
  ShieldCheck,
  Wheat,
  Fish,
  Carrot,
  FlaskConical,
  CupSoda,
  Package,
  Trash,
  Snowflake,
  SprayCan,
  Wrench,
  Tag,
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
import { pdfList } from "@/lib/pdf/docs";
import { useToast } from "@/components/Toast";
import { useApp } from "@/components/AppContext";
import { api } from "@/lib/api";
import { formatDateLong } from "@/lib/format";

type Category = {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  active: boolean;
  createdAt: string;
  itemCount: number;
};

const ICONS: Record<string, typeof Tag> = {
  wheat: Wheat,
  fish: Fish,
  carrot: Carrot,
  flask: FlaskConical,
  cup: CupSoda,
  package: Package,
  trash: Trash,
  snowflake: Snowflake,
  spray: SprayCan,
  wrench: Wrench,
  tag: Tag,
};

const COLORS = ["#d4a373", "#38bdf8", "#4ade80", "#facc15", "#c084fc", "#fb923c", "#94a3b8", "#67e8f9", "#2dd4bf", "#f472b6", "#f87171", "#a3e635"];

function iconFor(name: string) {
  return ICONS[name] ?? Tag;
}

export default function CategoriasPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Carregando…</div>}>
      <CategoriasInner />
    </Suspense>
  );
}

function CategoriasInner() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const { push } = useToast();
  const { org } = useApp();
  const [rows, setRows] = useState<Category[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, empty: 0 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("name-asc");
  const [modal, setModal] = useState<null | { mode: "create" | "edit"; row?: Category }>(null);
  const [view, setView] = useState<Category | null>(null);

  const load = useCallback(async () => {    setLoading(true);
    const r = await api<{ categories: Category[]; stats: typeof stats }>(
      `/api/categories?q=${encodeURIComponent(q)}&status=${status}&sort=${sort}`
    );
    if (r.ok) {
      setRows(r.data.categories ?? []);
      setStats(r.data.stats ?? { total: 0, active: 0, inactive: 0, empty: 0 });
    } else {
      push({ kind: "error", title: "Não foi possível carregar as categorias", msg: r.error });
    }
    setLoading(false);
  }, [q, status, sort, push]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    setQ(initialQ);
  }, [initialQ]);

  const toggle = async (row: Category) => {
    const res = await fetch(`/api/categories/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !row.active }),
    });
    if (res.ok) {
      push({ kind: "success", title: row.active ? "Categoria inativada" : "Categoria ativada" });
      load();
    } else {
      push({ kind: "error", title: "Não foi possível alterar o status" });
    }
  };

  const remove = async (row: Category) => {
    if (row.itemCount > 0) {
      push({ kind: "error", title: "Categoria com itens não pode ser excluída" });
      return;
    }
    if (!confirm(`Excluir a categoria "${row.name}"?`)) return;
    const res = await fetch(`/api/categories/${row.id}`, { method: "DELETE" });
    const json = await res.json();
    if (res.ok) {
      push({ kind: "success", title: "Categoria excluída" });
      load();
    } else {
      push({ kind: "error", title: json.error ?? "Erro ao excluir" });
    }
  };

  const exportPdf = (print: boolean) =>
    pdfList<Category>({
      org: org.name,
      title: "Categorias",
      subtitle: "Grupos operacionais do catálogo.",
      print,
      kpis: [
        { label: "Categorias", value: String(stats.total) },
        { label: "Ativas", value: String(stats.active) },
        { label: "Inativas", value: String(stats.inactive) },
        { label: "Sem itens", value: String(stats.empty) },
      ],
      columns: [
        { header: "Categoria", value: (r) => r.name },
        { header: "Descrição", value: (r) => r.description ?? "-" },
        { header: "Itens", align: "right", value: (r) => r.itemCount },
        { header: "Situação", align: "center", value: (r) => (r.active ? "Ativa" : "Inativa") },
        { header: "Criada em", value: (r) => formatDateLong(r.createdAt) },
      ],
      rows,
      filename: "categorias",
    });

  return (
    <div className="animate-fade-in">
      <p className="text-[12px] text-zinc-500">
        Operação <span className="mx-1.5 text-zinc-700">›</span> <span className="text-zinc-300">Categorias</span>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-[28px] font-bold tracking-tight text-white">Categorias</h2>
            <PageBadge>Grupos operacionais</PageBadge>
          </div>
          <p className="mt-1.5 text-[13.5px] text-zinc-400">
            Agrupe os insumos e materiais para pesquisar, filtrar e relatar com precisão.
          </p>
        </div>
        <PdfButton build={exportPdf} disabled={rows.length === 0} />
        <PrimaryButton onClick={() => setModal({ mode: "create" })}>
          <Plus className="size-4" /> Nova categoria
        </PrimaryButton>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Categorias" value={stats.total} hint="Grupos operacionais cadastrados" icon={<Tags className="size-4" />} />
        <StatCard label="Ativas" value={stats.active} hint="Disponíveis para novos itens" icon={<CheckCircle2 className="size-4" />} accent={<span className="size-1.5 rounded-full bg-emerald-400" />} />
        <StatCard label="Inativas" value={stats.inactive} hint="Histórico e vínculos preservados" icon={<PauseCircle className="size-4" />} />
        <StatCard label="Sem itens" value={stats.empty} hint="Podem ser excluídas com segurança" icon={<PackageX className="size-4" />} />
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#141417]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div>
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-white">
              Categorias cadastradas
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-300">{rows.length}</span>
            </h3>
            <p className="mt-0.5 text-[12.5px] text-zinc-500">Cada item pertence a exatamente uma categoria.</p>
          </div>
          <button onClick={load} className="flex items-center gap-1.5 text-[12.5px] font-medium text-zinc-400 transition hover:text-white">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>

        <div className="flex flex-col gap-2.5 px-5 py-4 sm:flex-row">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por nome…" />
          <Select
            value={sort}
            onChange={setSort}
            className="sm:w-[200px]"
            options={[
              { value: "name-asc", label: "Nome: A–Z" },
              { value: "name-desc", label: "Nome: Z–A" },
              { value: "recent", label: "Mais recentes" },
              { value: "items", label: "Mais itens" },
            ]}
          />
        </div>

        <div className="flex items-center justify-between gap-3 pr-5">
          <div className="min-w-0 flex-1">
            <Tabs
              active={status}
              onChange={setStatus}
              tabs={[
                { value: "all", label: "Todas", count: stats.total },
                { value: "active", label: "Ativas", count: stats.active },
                { value: "inactive", label: "Inativas", count: stats.inactive },
              ]}
            />
          </div>
          <p className="hidden shrink-0 items-center gap-1.5 text-[11.5px] text-zinc-600 md:flex">
            <ShieldCheck className="size-3.5" /> Categorias com itens não são excluídas
          </p>
        </div>

        {loading ? (
          <LoadingRows label="Carregando categorias…" />
        ) : (
          <TableShell
            head={
              <>
                <Th>Categoria ↑</Th>
                <Th>Itens vinculados</Th>
                <Th>Status</Th>
                <Th>Criada em</Th>
                <Th className="text-right">Ações</Th>
              </>
            }
            empty={rows.length === 0}
          >
            {rows.length === 0 ? (
              <EmptyState
                icon={<Tags className="size-7" />}
                title="Nenhuma categoria encontrada"
                description="Ajuste os filtros ou cadastre uma nova categoria para organizar o catálogo."
                action={
                  <PrimaryButton onClick={() => setModal({ mode: "create" })}>
                    <Plus className="size-4" /> Nova categoria
                  </PrimaryButton>
                }
              />
            ) : (
              rows.map((c) => {
                const Icon = iconFor(c.icon);
                return (
                  <tr key={c.id} className="transition hover:bg-white/[0.02]">
                    <Td>
                      <div className="flex items-center gap-3">
                        <span
                          className="grid size-10 shrink-0 place-items-center rounded-lg border border-white/[0.07]"
                          style={{ backgroundColor: `${c.color}1a`, color: c.color }}
                        >
                          <Icon className="size-[18px]" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-semibold text-white">{c.name}</p>
                          {c.description ? (
                            <p className="line-clamp-1 text-[12px] text-zinc-500">{c.description}</p>
                          ) : null}
                        </div>
                      </div>
                    </Td>
                    <Td>
                      {c.itemCount === 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-zinc-500">
                          <PackageX className="size-3.5" /> Nenhum item
                        </span>
                      ) : (
                        <span className="text-[12.5px] font-medium text-zinc-300">
                          {c.itemCount} {c.itemCount === 1 ? "item" : "itens"}
                        </span>
                      )}
                    </Td>
                    <Td>
                      {c.active ? (
                        <StatusPill tone="green">Ativo</StatusPill>
                      ) : (
                        <StatusPill tone="gray">Inativo</StatusPill>
                      )}
                    </Td>
                    <Td>
                      <span className="whitespace-nowrap text-[13px] font-medium text-zinc-200">
                        {formatDateLong(c.createdAt)}
                      </span>
                    </Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn title="Ver detalhes" onClick={() => setView(c)}><Eye className="size-4" /></IconBtn>
                        <IconBtn title="Editar" onClick={() => setModal({ mode: "edit", row: c })}><Pencil className="size-4" /></IconBtn>
                        <IconBtn title={c.active ? "Inativar" : "Ativar"} onClick={() => toggle(c)}><Power className="size-4" /></IconBtn>
                        <IconBtn title="Excluir" danger onClick={() => remove(c)}><Trash2 className="size-4" /></IconBtn>
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </TableShell>
        )}
      </div>

      <CategoryModal
        modal={modal}
        onClose={() => setModal(null)}
        onSaved={() => {
          setModal(null);
          load();
        }}
      />

      <Modal
        open={!!view}
        onClose={() => setView(null)}
        title={view?.name ?? ""}
        subtitle="Detalhes da categoria"
      >
        {view ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span
                className="grid size-12 place-items-center rounded-xl border border-white/[0.07]"
                style={{ backgroundColor: `${view.color}1a`, color: view.color }}
              >
                {(() => {
                  const I = iconFor(view.icon);
                  return <I className="size-5" />;
                })()}
              </span>
              <div>
                <p className="text-[14px] font-semibold text-white">{view.name}</p>
                <p className="text-[12.5px] text-zinc-500">{view.itemCount} item(ns) vinculados</p>
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 text-[13px] leading-relaxed text-zinc-400">
              {view.description || "Sem descrição cadastrada."}
            </div>
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <div className="rounded-xl border border-white/[0.07] p-3.5">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Status</p>
                <p className="mt-1 font-semibold text-white">{view.active ? "Ativa" : "Inativa"}</p>
              </div>
              <div className="rounded-xl border border-white/[0.07] p-3.5">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Criada em</p>
                <p className="mt-1 font-semibold text-white">{formatDateLong(view.createdAt)}</p>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] ${
        danger ? "hover:text-red-400" : "hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function CategoryModal({
  modal,
  onClose,
  onSaved,
}: {
  modal: null | { mode: "create" | "edit"; row?: Category };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { push } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("tag");
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (modal?.mode === "edit" && modal.row) {
      setName(modal.row.name);
      setDescription(modal.row.description ?? "");
      setIcon(modal.row.icon);
      setColor(modal.row.color);
    } else if (modal?.mode === "create") {
      setName("");
      setDescription("");
      setIcon("tag");
      setColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
    }
  }, [modal]);

  if (!modal) return null;

  const save = async () => {
    if (!name.trim()) {
      push({ kind: "error", title: "Informe o nome da categoria" });
      return;
    }
    setSaving(true);
    try {
      const url =
        modal.mode === "create"
          ? "/api/categories"
          : `/api/categories/${modal.row?.id}`;
      const res = await fetch(url, {
        method: modal.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, icon, color }),
      });
      if (res.ok) {
        push({
          kind: "success",
          title: modal.mode === "create" ? "Categoria criada" : "Categoria atualizada",
          msg: name.trim(),
        });
        onSaved();
      } else {
        const j = await res.json();
        push({ kind: "error", title: j.error ?? "Erro ao salvar" });
      }
    } finally {
      setSaving(false);
    }
  };

  const Preview = iconFor(icon);

  return (
    <Modal
      open
      onClose={onClose}
      title={modal.mode === "create" ? "Nova categoria" : "Editar categoria"}
      subtitle="Agrupamento operacional do catálogo"
    >
      <div className="space-y-4">
        <Field label="Nome da categoria" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Peixes e frutos do mar"
            className={inputCls}
          />
        </Field>
        <Field label="Descrição" hint="Opcional · ajuda a equipe a classificar itens">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="O que pertence a este grupo?"
            rows={3}
            className={`${inputCls} resize-none`}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ícone">
            <div className="grid grid-cols-6 gap-1.5">
              {Object.keys(ICONS).map((k) => {
                const I = ICONS[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setIcon(k)}
                    className={`grid size-9 place-items-center rounded-lg border transition ${
                      icon === k
                        ? "border-white/30 bg-white/10 text-white"
                        : "border-white/[0.07] bg-white/[0.02] text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <I className="size-4" />
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Cor">
            <div className="grid grid-cols-6 gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`grid size-9 place-items-center rounded-lg border transition ${
                    color === c ? "border-white/40" : "border-white/[0.07]"
                  }`}
                  style={{ backgroundColor: `${c}22` }}
                >
                  <span className="size-4 rounded-full" style={{ backgroundColor: c }} />
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5">
          <span
            className="grid size-10 place-items-center rounded-lg border border-white/[0.07]"
            style={{ backgroundColor: `${color}1a`, color }}
          >
            <Preview className="size-[18px]" />
          </span>
          <div>
            <p className="text-[13.5px] font-semibold text-white">{name.trim() || "Pré-visualização"}</p>
            <p className="text-[12px] text-zinc-500">É assim que a categoria aparece nas listas</p>
          </div>
        </div>
        <div className="flex justify-end gap-2.5 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2.5 text-[13px] font-medium text-zinc-300 hover:text-white"
          >
            Cancelar
          </button>
          <PrimaryButton onClick={save} disabled={saving}>
            {saving ? "Salvando…" : modal.mode === "create" ? "Criar categoria" : "Salvar alterações"}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
