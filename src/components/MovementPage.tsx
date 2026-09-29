"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  RefreshCw,
  Eye,
  CheckCircle2,
  Undo2,
  Trash2,
  ShieldCheck,
  X,
  FileClock,
  PackageX,
  Loader2,
  AlertTriangle,
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
import { formatCurrency, formatDateBR, formatDateTime, formatQty } from "@/lib/format";

export type MovementType = "entrada" | "saida" | "transferencia";

type Movement = {
  id: string;
  code: string;
  type: string;
  status: "rascunho" | "confirmada" | "estornada";
  supplier: string | null;
  invoiceNumber: string | null;
  responsible: string | null;
  reason: string | null;
  sourceLocationId: string | null;
  destLocationId: string | null;
  sourceLocationName: string | null;
  destLocationName: string | null;
  totalCost: string;
  movementDate: string;
  createdAt: string;
  itemCount: number;
  totalQty: number;
};

type Stats = {
  total: number;
  confirmed: number;
  draft: number;
  reversed: number;
  consumo: number;
  perdas: number;
};

type ItemOpt = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  costPrice: string;
  lotControl: boolean;
  expiryControl: boolean;
};
type LocOpt = { id: string; name: string };

const EMPTY_STATS: Stats = { total: 0, confirmed: 0, draft: 0, reversed: 0, consumo: 0, perdas: 0 };

const REASONS = [
  "Consumo — cozinha",
  "Consumo — delivery",
  "Uso operacional",
  "Perda / quebra",
  "Vencimento",
  "Avaria",
  "Ajuste de inventário",
];

const LABEL: Record<MovementType, { new: string; history: string; historyDesc: string }> = {
  entrada: {
    new: "Nova entrada",
    history: "Histórico de entradas",
    historyDesc: "Rascunhos, confirmações e estornos em uma trilha única.",
  },
  saida: {
    new: "Nova saída",
    history: "Histórico de saídas",
    historyDesc: "Consumo, perdas, vencimentos e ajustes em uma trilha única.",
  },
  transferencia: {
    new: "Nova transferência",
    history: "Histórico",
    historyDesc: "Transferências confirmadas e estornos rastreáveis.",
  },
};

type Pending = { id: string; code: string; action: "confirm" | "reverse" | "delete" };

export function MovementPage({
  type,
  breadcrumb,
  title,
  badge,
  subtitle,
  emptyTitle,
  emptyDesc,
  icon,
}: {
  type: MovementType;
  breadcrumb: string;
  title: string;
  badge: string;
  subtitle: string;
  emptyTitle: string;
  emptyDesc: string;
  icon: React.ReactNode;
}) {  const { push } = useToast();
  const { org, refreshAlerts } = useApp();
  const [rows, setRows] = useState<Movement[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [location, setLocation] = useState("all");
  const [reason, setReason] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [locs, setLocs] = useState<LocOpt[]>([]);
  const [modal, setModal] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const reqId = useRef(0);
  const L = LABEL[type];

  const load = useCallback(async () => {
    const my = ++reqId.current;
    setLoading(true);
    const params = new URLSearchParams({ type, q, status, location, reason, from, to });
    const res = await api<{ movements: Movement[]; stats: Stats }>(`/api/movements?${params}`);
    if (my !== reqId.current) return; // resposta antiga: ignora
    if (res.ok) {
      setRows(res.data.movements ?? []);
      setStats({ ...EMPTY_STATS, ...(res.data.stats ?? {}) });
    } else {
      push({ kind: "error", title: "Não foi possível carregar o histórico", msg: res.error });
    }
    setLoading(false);
  }, [type, q, status, location, reason, from, to, push]);

  useEffect(() => {
    api<{ locations: LocOpt[] }>("/api/locations?status=active").then((r) => {
      if (r.ok) setLocs((r.data.locations ?? []).map((l) => ({ id: l.id, name: l.name })));
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);  const onDone = () => {
    setPending(null);
    setDetailId(null);
    load();
    refreshAlerts();
  };

  const tabs = useMemo(() => {
    const base = [{ value: "all", label: "Todas", count: stats.total }];
    if (type === "entrada") base.push({ value: "rascunho", label: "Rascunhos", count: stats.draft });
    base.push({ value: "confirmada", label: "Confirmadas", count: stats.confirmed });
    base.push({ value: "estornada", label: "Estornadas", count: stats.reversed });
    if (type !== "entrada" && stats.draft > 0) {
      base.splice(1, 0, { value: "rascunho", label: "Rascunhos", count: stats.draft });
    }
    return base;
  }, [type, stats]);

  const hasFilters = q || location !== "all" || reason !== "all" || from || to;

  const exportPdf = (print: boolean) =>
    pdfList<Movement>({
      org: org.name,
      title: title,
      subtitle: subtitle,
      landscape: true,
      print,
      kpis: [
        { label: "Registradas", value: String(stats.total) },
        { label: "Confirmadas", value: String(stats.confirmed) },
        { label: type === "saida" ? "Perdas" : "Rascunhos", value: String(type === "saida" ? stats.perdas : stats.draft) },
        { label: "Estornadas", value: String(stats.reversed) },
      ],
      columns: [
        { header: "Documento", value: (m) => m.code },
        { header: "Data", value: (m) => formatDateBR(m.movementDate) },
        { header: type === "entrada" ? "Fornecedor" : "Responsável", value: (m) => (type === "entrada" ? m.supplier ?? "-" : m.responsible ?? "-") },
        { header: "Motivo / NF", value: (m) => m.reason ?? m.invoiceNumber ?? "-" },
        { header: "Local", value: (m) => (m.sourceLocationName && m.destLocationName ? m.sourceLocationName + " -> " + m.destLocationName : m.destLocationName ?? m.sourceLocationName ?? "-") },
        { header: "Itens", align: "right", value: (m) => m.itemCount },
        { header: "Qtd.", align: "right", value: (m) => formatQty(m.totalQty) },
        { header: "Valor", align: "right", value: (m) => formatCurrency(m.totalCost) },
        { header: "Situação", align: "center", value: (m) => m.status },
      ],
      rows,
      foot: ["Total", "", "", "", "", "", "", formatCurrency(rows.reduce((a, m) => a + Number(m.totalCost), 0)), ""],
      rowTone: (m) => (m.status === "estornada" ? "amber" : null),
      filename: "movimentacoes-" + type,
    });

  return (
    <div className="animate-fade-in">
      <p className="text-[12px] text-zinc-500">
        Movimentação <span className="mx-1.5 text-zinc-700">›</span>{" "}
        <span className="text-zinc-300">{breadcrumb}</span>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[28px] font-bold tracking-tight text-white">{title}</h2>
            <PageBadge>{badge}</PageBadge>
          </div>
          <p className="mt-1.5 text-[13.5px] text-zinc-400">{subtitle}</p>
        </div>
        <PdfButton build={exportPdf} disabled={rows.length === 0} />
        <PrimaryButton onClick={() => setModal(true)}>
          <Plus className="size-4" /> {L.new}
        </PrimaryButton>
      </div>

      {/* KPIs */}
      {type === "entrada" ? (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Entradas registradas" value={stats.total} hint="Todo o histórico de recebimentos" icon={icon} />
          <StatCard label="Confirmadas" value={stats.confirmed} hint="Atualizaram os saldos por local" icon={<CheckCircle2 className="size-4" />} />
          <StatCard label="Rascunhos" value={stats.draft} hint="Ainda não alteraram o estoque" icon={<FileClock className="size-4" />} accent={stats.draft > 0 ? <span className="size-1.5 rounded-full bg-amber-400" /> : null} />
          <StatCard label="Estornadas" value={stats.reversed} hint="Correções com trilha de auditoria" icon={<Undo2 className="size-4" />} />
        </div>
      ) : type === "saida" ? (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Saídas registradas" value={stats.total} hint="Todo o histórico de retiradas" icon={icon} />
          <StatCard label="Consumo" value={stats.consumo} hint="Cozinha, delivery e uso operacional" icon={<CheckCircle2 className="size-4" />} />
          <StatCard label="Perdas e vencimentos" value={stats.perdas} hint="Perda, vencimento e avaria" icon={<PackageX className="size-4" />} accent={stats.perdas > 0 ? <span className="size-1.5 rounded-full bg-red-500" /> : null} />
          <StatCard label="Estornadas" value={stats.reversed} hint="Correções com trilha de auditoria" icon={<Undo2 className="size-4" />} />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3 xl:max-w-[75%]">
          <StatCard label="Transferências" value={stats.total} hint="Total de operações entre locais" icon={icon} />
          <StatCard label="Confirmadas" value={stats.confirmed} hint="Movimentos definitivos" icon={<CheckCircle2 className="size-4" />} />
          <StatCard label="Estornadas" value={stats.reversed} hint="Revertidas com auditoria" icon={<Undo2 className="size-4" />} />
        </div>
      )}

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#141417]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div>
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-white">
              {L.history}
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-300">{rows.length}</span>
            </h3>
            <p className="mt-0.5 text-[12.5px] text-zinc-500">{L.historyDesc}</p>
          </div>
          <div className="flex items-center gap-3">
            {hasFilters ? (
              <button
                onClick={() => {
                  setQ("");
                  setLocation("all");
                  setReason("all");
                  setFrom("");
                  setTo("");
                }}
                className="text-[12.5px] font-medium text-zinc-500 transition hover:text-white"
              >
                Limpar filtros
              </button>
            ) : null}
            <button onClick={load} className="flex items-center gap-1.5 text-[12.5px] font-medium text-zinc-400 transition hover:text-white">
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 px-5 py-4 xl:flex-row">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder={type === "entrada" ? "Buscar por número, fornecedor ou nota fiscal…" : "Buscar por número ou responsável…"}
          />
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Select
              value={location}
              onChange={setLocation}
              className="sm:w-[190px]"
              options={[{ value: "all", label: "Todos os locais" }, ...locs.map((l) => ({ value: l.id, label: l.name }))]}
            />
            {type === "saida" ? (
              <Select
                value={reason}
                onChange={setReason}
                className="sm:w-[190px]"
                options={[
                  { value: "all", label: "Todos os motivos" },
                  { value: "consumo", label: "Consumo (todos)" },
                  { value: "perdas", label: "Perdas e vencimentos" },
                  ...REASONS.map((r) => ({ value: r, label: r })),
                ]}
              />
            ) : null}
            {type !== "entrada" ? (
              <div className="flex items-center gap-2">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} bg-[#1a1a1f] sm:w-[150px]`} aria-label="Data inicial" />
                <span className="text-[12.5px] text-zinc-500">até</span>
                <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={`${inputCls} bg-[#1a1a1f] sm:w-[150px]`} aria-label="Data final" />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pr-5">
          <div className="min-w-0 flex-1">
            <Tabs active={status} onChange={setStatus} tabs={tabs} />
          </div>
          <p className="hidden shrink-0 items-center gap-1.5 text-[11.5px] text-zinc-600 md:flex">
            <ShieldCheck className="size-3.5" /> {type === "transferencia" ? "Transferências imutáveis" : "Confirmações imutáveis"}
          </p>
        </div>

        {loading && rows.length === 0 ? (
          <LoadingRows label="Carregando histórico…" />
        ) : (
          <div className={loading ? "opacity-60 transition" : "transition"}>
            <TableShell
              head={
                <>
                  <Th>{type === "entrada" ? "Entrada / Fornecedor" : type === "saida" ? "Saída / Responsável" : "Transferência"}</Th>
                  <Th>{type === "entrada" ? "Recebimento" : "Data"}</Th>
                  <Th>{type === "entrada" ? "Local de destino" : type === "saida" ? "Local de origem" : "Locais"}</Th>
                  {type === "saida" ? <Th>Motivo</Th> : null}
                  <Th>Itens</Th>
                  {type === "entrada" ? <Th>Custo informado</Th> : type === "transferencia" ? <Th>Qtd. total</Th> : null}
                  <Th>Status</Th>
                  <Th className="text-right">Ações</Th>
                </>
              }
              empty={rows.length === 0}
            >
              {rows.length === 0 ? (
                hasFilters || status !== "all" ? (
                  <EmptyState icon={icon} title="Nada encontrado" description="Nenhuma movimentação corresponde aos filtros aplicados." />
                ) : (
                  <EmptyState
                    icon={icon}
                    title={emptyTitle}
                    description={emptyDesc}
                    action={
                      <PrimaryButton onClick={() => setModal(true)}>
                        <Plus className="size-4" /> {L.new}
                      </PrimaryButton>
                    }
                  />
                )
              ) : (
                rows.map((m) => (
                  <tr key={m.id} className="transition hover:bg-white/[0.02]">
                    <Td>
                      <button onClick={() => setDetailId(m.id)} className="text-left">
                        <p className="font-mono text-[12.5px] font-semibold text-white hover:underline">{m.code}</p>
                        <p className="mt-0.5 max-w-[220px] truncate text-[12px] text-zinc-500">
                          {type === "entrada"
                            ? `${m.supplier || "Sem fornecedor"}${m.invoiceNumber ? ` · NF ${m.invoiceNumber}` : ""}`
                            : m.responsible || "—"}
                        </p>
                      </button>
                    </Td>
                    <Td>
                      <span className="whitespace-nowrap text-[12.5px] text-zinc-300">{formatDateBR(m.movementDate)}</span>
                    </Td>
                    <Td>
                      <span className="text-[12.5px] text-zinc-300">
                        {type === "entrada"
                          ? m.destLocationName ?? "—"
                          : type === "saida"
                            ? m.sourceLocationName ?? "—"
                            : `${m.sourceLocationName ?? "?"} → ${m.destLocationName ?? "?"}`}
                      </span>
                    </Td>
                    {type === "saida" ? (
                      <Td>
                        <ReasonTag reason={m.reason} />
                      </Td>
                    ) : null}
                    <Td>
                      <span className="text-[12.5px] text-zinc-300">
                        {m.itemCount} {m.itemCount === 1 ? "item" : "itens"}
                      </span>
                    </Td>
                    {type === "entrada" ? (
                      <Td>
                        <span className="text-[12.5px] font-medium text-zinc-200">{formatCurrency(m.totalCost)}</span>
                      </Td>
                    ) : null}
                    {type === "transferencia" ? (
                      <Td>
                        <span className="text-[12.5px] text-zinc-300">{formatQty(m.totalQty)}</span>
                      </Td>
                    ) : null}
                    <Td>
                      <MovStatus status={m.status} />
                    </Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn title="Ver detalhes" onClick={() => setDetailId(m.id)}>
                          <Eye className="size-4" />
                        </IconBtn>
                        {m.status === "rascunho" ? (
                          <>
                            <IconBtn title="Confirmar" tone="green" onClick={() => setPending({ id: m.id, code: m.code, action: "confirm" })}>
                              <CheckCircle2 className="size-4" />
                            </IconBtn>
                            <IconBtn title="Excluir rascunho" tone="red" onClick={() => setPending({ id: m.id, code: m.code, action: "delete" })}>
                              <Trash2 className="size-4" />
                            </IconBtn>
                          </>
                        ) : null}
                        {m.status === "confirmada" ? (
                          <IconBtn title="Estornar" tone="amber" onClick={() => setPending({ id: m.id, code: m.code, action: "reverse" })}>
                            <Undo2 className="size-4" />
                          </IconBtn>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </TableShell>
          </div>
        )}
      </div>

      <MovementModal type={type} open={modal} locs={locs} onClose={() => setModal(false)} onSaved={() => { setModal(false); load(); refreshAlerts(); }} />
      <MovementDetail id={detailId} onClose={() => setDetailId(null)} onAsk={setPending} />
      <ConfirmAction pending={pending} onClose={() => setPending(null)} onDone={onDone} />
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  tone?: "green" | "red" | "amber";
}) {
  const hover =
    tone === "green" ? "hover:text-emerald-400" : tone === "red" ? "hover:text-red-400" : tone === "amber" ? "hover:text-amber-400" : "hover:text-white";
  return (
    <button title={title} aria-label={title} onClick={onClick} className={`grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] ${hover}`}>
      {children}
    </button>
  );
}

function MovStatus({ status }: { status: string }) {
  if (status === "confirmada") return <StatusPill tone="green">Confirmada</StatusPill>;
  if (status === "rascunho") return <StatusPill tone="yellow">Rascunho</StatusPill>;
  return <StatusPill tone="gray">Estornada</StatusPill>;
}

function ReasonTag({ reason }: { reason: string | null }) {
  if (!reason) return <span className="text-[12.5px] text-zinc-600">—</span>;
  const loss = ["Perda / quebra", "Vencimento", "Avaria"].includes(reason);
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-[11.5px] font-medium ${
        loss ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-white/10 bg-white/[0.04] text-zinc-300"
      }`}
    >
      {reason}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Confirmação de ações (confirmar / estornar / excluir)               */
/* ------------------------------------------------------------------ */

function ConfirmAction({
  pending,
  onClose,
  onDone,
}: {
  pending: Pending | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { push } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setReason("");
    setBusy(false);
  }, [pending]);

  if (!pending) return null;

  const meta = {
    confirm: {
      title: "Confirmar movimentação",
      desc: "O saldo dos locais será atualizado imediatamente. Após confirmada, a movimentação só pode ser corrigida por estorno.",
      cta: "Confirmar",
    },
    reverse: {
      title: "Estornar movimentação",
      desc: "Os saldos serão revertidos e a movimentação ficará marcada como estornada, preservando o histórico.",
      cta: "Estornar",
    },
    delete: {
      title: "Excluir rascunho",
      desc: "O rascunho será removido. Ele ainda não havia alterado o estoque.",
      cta: "Excluir",
    },
  }[pending.action];

  const run = async () => {
    if (busy) return;
    if (pending.action === "reverse" && reason.trim().length < 3) {
      push({ kind: "error", title: "Informe a justificativa do estorno" });
      return;
    }
    setBusy(true);
    const res =
      pending.action === "delete"
        ? await api(`/api/movements/${pending.id}`, { method: "DELETE" })
        : await api(`/api/movements/${pending.id}`, {
            method: "PATCH",
            json: { action: pending.action, reason },
          });
    setBusy(false);
    if (res.ok) {
      push({
        kind: "success",
        title:
          pending.action === "confirm" ? "Movimentação confirmada" : pending.action === "reverse" ? "Movimentação estornada" : "Rascunho excluído",
        msg: pending.code,
      });
      onDone();
    } else {
      push({ kind: "error", title: "Operação não realizada", msg: res.error });
    }
  };

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={meta.title} subtitle={pending.code}>
      <div className="space-y-4">
        <p className="text-[13.5px] leading-relaxed text-zinc-400">{meta.desc}</p>
        {pending.action === "reverse" ? (
          <Field label="Justificativa" required>
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ex.: quantidade lançada em duplicidade"
              className={`${inputCls} resize-none`}
            />
          </Field>
        ) : null}
        <div className="flex justify-end gap-2.5">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-white/10 px-4 py-2.5 text-[13px] font-medium text-zinc-300 hover:text-white disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={run}
            disabled={busy}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition disabled:opacity-60 ${
              pending.action === "confirm"
                ? "bg-zinc-100 text-zinc-950 hover:bg-white"
                : pending.action === "reverse"
                  ? "bg-amber-500 text-zinc-950 hover:bg-amber-400"
                  : "bg-red-500 text-white hover:bg-red-400"
            }`}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {meta.cta}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Formulário de nova movimentação                                     */
/* ------------------------------------------------------------------ */

type Line = {
  key: number;
  itemId: string;
  quantity: string;
  unitCost: string;
  lotCode: string;
  expiryDate: string;
};

let lineKey = 1;
const newLine = (): Line => ({ key: lineKey++, itemId: "", quantity: "", unitCost: "", lotCode: "", expiryDate: "" });

function MovementModal({
  type,
  open,
  locs,
  onClose,
  onSaved,
}: {
  type: MovementType;
  open: boolean;
  locs: LocOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { push } = useToast();
  const [items, setItems] = useState<ItemOpt[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [invoice, setInvoice] = useState("");
  const [responsible, setResponsible] = useState("Operador de Estoque");
  const [reason, setReason] = useState(REASONS[0]);
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("");
  const [dest, setDest] = useState("");
  const [date, setDate] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<null | "rascunho" | "confirmada">(null);

  useEffect(() => {
    if (!open) return;
    setSupplier("");
    setInvoice("");
    setReason(REASONS[0]);
    setNotes("");
    setSource("");
    setDest("");
    setDate(new Date().toLocaleDateString("en-CA"));
    setLines([newLine()]);
    setBalances({});
    setSaving(null);
    setItemsLoading(true);
    api<{ items: ItemOpt[] }>("/api/items?status=active").then((r) => {
      setItems(r.ok ? r.data.items ?? [] : []);
      setItemsLoading(false);
    });
  }, [open]);

  // saldo disponível na origem
  useEffect(() => {
    if (!open || type === "entrada" || !source) {
      setBalances({});
      return;
    }
    let alive = true;
    api<{ balances: Record<string, number> }>(`/api/stock?locationId=${source}`).then((r) => {
      if (alive && r.ok) setBalances(r.data.balances ?? {});
    });
    return () => {
      alive = false;
    };
  }, [open, type, source]);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const selectable = useMemo(() => {
    if (type === "entrada" || !source) return items;
    return items.filter((i) => (balances[i.id] ?? 0) > 0);
  }, [items, balances, source, type]);

  // quantidade pedida por item (somando linhas repetidas)
  const requested = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of lines) if (l.itemId) m[l.itemId] = (m[l.itemId] ?? 0) + Number(l.quantity || 0);
    return m;
  }, [lines]);

  if (!open) return null;

  const update = (key: number, patch: Partial<Line>) =>
    setLines((p) =>
      p.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (patch.itemId && type === "entrada" && !l.unitCost) {
          const it = itemMap.get(patch.itemId);
          if (it && Number(it.costPrice) > 0) next.unitCost = String(Number(it.costPrice));
        }
        return next;
      })
    );

  const validate = (confirm: boolean): string | null => {
    if (type === "entrada" && !dest) return "Selecione o local de destino.";
    if (type !== "entrada" && !source) return "Selecione o local de origem.";
    if (type === "transferencia" && !dest) return "Selecione o local de destino.";
    if (type === "transferencia" && source === dest) return "Origem e destino devem ser diferentes.";
    const valid = lines.filter((l) => l.itemId && Number(l.quantity) > 0);
    if (valid.length === 0) return "Adicione ao menos um item com quantidade maior que zero.";
    if (lines.some((l) => l.itemId && !(Number(l.quantity) > 0))) return "Há linhas com quantidade inválida.";
    if (confirm && type === "entrada") {
      for (const l of valid) {
        const it = itemMap.get(l.itemId);
        if (it?.lotControl && !l.lotCode.trim()) return `"${it.name}" exige número de lote.`;
        if (it?.expiryControl && !l.expiryDate) return `"${it.name}" exige data de validade.`;
      }
    }
    if (confirm && type !== "entrada") {
      for (const [itemId, qty] of Object.entries(requested)) {
        const available = balances[itemId] ?? 0;
        if (qty > available + 1e-9) {
          return `Saldo insuficiente de "${itemMap.get(itemId)?.name ?? "item"}": disponível ${formatQty(available)}.`;
        }
      }
    }
    return null;
  };

  const save = async (mode: "rascunho" | "confirmada") => {
    if (saving) return;
    const err = validate(mode === "confirmada");
    if (err) {
      push({ kind: "error", title: "Revise a movimentação", msg: err });
      return;
    }
    setSaving(mode);
    const res = await api<{ movement?: { code: string } }>("/api/movements", {
      method: "POST",
      json: {
        type,
        status: mode,
        supplier,
        invoiceNumber: invoice,
        responsible,
        reason: type === "saida" ? reason : type === "transferencia" ? "Transferência entre locais" : "Recebimento",
        notes,
        sourceLocationId: type === "entrada" ? null : source,
        destLocationId: type === "saida" ? null : dest,
        movementDate: date,
        items: lines
          .filter((l) => l.itemId && Number(l.quantity) > 0)
          .map((l) => ({
            itemId: l.itemId,
            quantity: Number(l.quantity),
            unitCost: Number(l.unitCost || 0),
            lotCode: l.lotCode,
            expiryDate: l.expiryDate || undefined,
          })),
      },
    });
    setSaving(null);
    if (res.ok) {
      push({
        kind: "success",
        title: mode === "confirmada" ? "Movimentação confirmada" : "Rascunho salvo",
        msg: res.data.movement?.code,
      });
      onSaved();
    } else {
      push({ kind: "error", title: "Não foi possível salvar", msg: res.error });
    }
  };

  const total = lines.reduce((a, l) => a + Number(l.quantity || 0) * Number(l.unitCost || 0), 0);
  const locSelect = (value: string, onChange: (v: string) => void, exclude?: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="" className="bg-zinc-900">Selecionar…</option>
      {locs
        .filter((l) => l.id !== exclude)
        .map((l) => (
          <option key={l.id} value={l.id} className="bg-zinc-900">
            {l.name}
          </option>
        ))}
    </select>
  );

  const needsSourceFirst = type !== "entrada" && !source;

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      wide
      title={LABEL[type].new}
      subtitle={
        type === "entrada"
          ? "Registre o recebimento e confira antes de confirmar"
          : type === "saida"
            ? "Baixa com validação de saldo por local"
            : "Move saldo mantendo cada local isolado"
      }
    >
      <div className="space-y-4">
        {!itemsLoading && items.length === 0 ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-[13px] text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Nenhum item ativo cadastrado.{" "}
              <a href="/itens" className="font-semibold underline">
                Cadastre itens primeiro
              </a>{" "}
              para movimentar o estoque.
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {type === "entrada" ? (
            <>
              <Field label="Fornecedor">
                <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Ex.: Peixaria Central" className={inputCls} />
              </Field>
              <Field label="Nota fiscal">
                <input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Ex.: 000123" className={inputCls} />
              </Field>
              <Field label="Local de destino" required>
                {locSelect(dest, setDest)}
              </Field>
              <Field label="Data de recebimento">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </Field>
            </>
          ) : null}
          {type === "saida" ? (
            <>
              <Field label="Local de origem" required>
                {locSelect(source, setSource)}
              </Field>
              <Field label="Motivo" required>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}>
                  {REASONS.map((r) => (
                    <option key={r} className="bg-zinc-900">
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : null}
          {type === "transferencia" ? (
            <>
              <Field label="Local de origem" required>
                {locSelect(source, (v) => { setSource(v); if (v === dest) setDest(""); })}
              </Field>
              <Field label="Local de destino" required>
                {locSelect(dest, setDest, source)}
              </Field>
            </>
          ) : null}
          <Field label={type === "entrada" ? "Responsável pelo recebimento" : "Responsável"}>
            <input value={responsible} onChange={(e) => setResponsible(e.target.value)} className={inputCls} />
          </Field>
          {type !== "entrada" ? (
            <Field label="Data">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </Field>
          ) : null}
        </div>

        {/* Linhas */}
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.01] p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12.5px] font-semibold text-zinc-300">
              Itens <span className="font-normal text-zinc-600">· {lines.filter((l) => l.itemId).length} selecionado(s)</span>
            </p>
            <button
              onClick={() => setLines((p) => [...p, newLine()])}
              disabled={lines.length >= 50}
              className="text-[12.5px] font-semibold text-zinc-200 hover:text-white disabled:opacity-40"
            >
              + Adicionar linha
            </button>
          </div>

          {needsSourceFirst ? (
            <p className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-[12.5px] text-zinc-500">
              Selecione o local de origem para ver os itens com saldo disponível.
            </p>
          ) : type !== "entrada" && selectable.length === 0 && !itemsLoading ? (
            <p className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-[12.5px] text-zinc-500">
              Este local não possui saldo de nenhum item. Registre uma entrada ou escolha outro local.
            </p>
          ) : (
            <div className="space-y-2.5">
              {lines.map((l) => {
                const it = l.itemId ? itemMap.get(l.itemId) : undefined;
                const available = balances[l.itemId] ?? 0;
                const over = type !== "entrada" && !!l.itemId && (requested[l.itemId] ?? 0) > available + 1e-9;
                return (
                  <div key={l.key} className="rounded-lg border border-white/[0.06] bg-[#0f0f12] p-2.5">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_110px_120px_36px]">
                      <select
                        value={l.itemId}
                        onChange={(e) => update(l.key, { itemId: e.target.value })}
                        className={`${inputCls} col-span-2 min-w-0 sm:col-span-1`}
                      >
                        <option value="" className="bg-zinc-900">
                          {itemsLoading ? "Carregando itens…" : "Selecionar item…"}
                        </option>
                        {selectable.map((i) => (
                          <option key={i.id} value={i.id} className="bg-zinc-900">
                            {i.name} · {i.unit}
                            {type !== "entrada" ? ` (disp. ${formatQty(balances[i.id] ?? 0)})` : ""}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.001"
                        value={l.quantity}
                        placeholder={`Qtd.${it ? ` (${it.unit})` : ""}`}
                        onChange={(e) => update(l.key, { quantity: e.target.value })}
                        className={`${inputCls} px-2.5 ${over ? "border-red-500/50 text-red-300" : ""}`}
                        aria-label="Quantidade"
                      />
                      {type === "entrada" ? (
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={l.unitCost}
                          placeholder="Custo un. R$"
                          onChange={(e) => update(l.key, { unitCost: e.target.value })}
                          className={`${inputCls} px-2.5`}
                          aria-label="Custo unitário"
                        />
                      ) : (
                        <div className={`flex items-center rounded-lg border px-2.5 text-[12px] ${over ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-white/[0.06] text-zinc-500"}`}>
                          {l.itemId ? `Disp.: ${formatQty(available)}` : "—"}
                        </div>
                      )}
                      <button
                        onClick={() => setLines((p) => (p.length === 1 ? [newLine()] : p.filter((x) => x.key !== l.key)))}
                        className="grid h-[42px] place-items-center rounded-lg border border-white/[0.08] text-zinc-500 hover:text-red-400"
                        aria-label="Remover linha"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    {type === "entrada" && it ? (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input
                          value={l.lotCode}
                          onChange={(e) => update(l.key, { lotCode: e.target.value })}
                          placeholder={it.lotControl ? "Lote (obrigatório)" : "Lote (opcional)"}
                          className={`${inputCls} px-2.5 ${it.lotControl && !l.lotCode ? "border-sky-500/30" : ""}`}
                        />
                        <input
                          type="date"
                          value={l.expiryDate}
                          onChange={(e) => update(l.key, { expiryDate: e.target.value })}
                          className={`${inputCls} px-2.5 ${it.expiryControl && !l.expiryDate ? "border-amber-500/30" : ""}`}
                          title={it.expiryControl ? "Validade (obrigatória)" : "Validade (opcional)"}
                          aria-label="Validade"
                        />
                      </div>
                    ) : null}
                    {type === "entrada" && it && Number(l.quantity) > 0 && Number(l.unitCost) > 0 ? (
                      <p className="mt-1.5 text-right text-[11.5px] text-zinc-500">
                        Subtotal {formatCurrency(Number(l.quantity) * Number(l.unitCost))}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Field label="Observações">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Informações adicionais…" className={`${inputCls} resize-none`} />
        </Field>

        <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
          {type === "entrada" ? (
            <p className="text-[13px] text-zinc-400">
              Total informado: <strong className="text-white">{formatCurrency(total)}</strong>
            </p>
          ) : (
            <p className="text-[12.5px] text-zinc-500">A confirmação valida o saldo no servidor.</p>
          )}
          <div className="flex flex-wrap justify-end gap-2.5">
            <button onClick={onClose} disabled={!!saving} className="rounded-lg border border-white/10 px-4 py-2.5 text-[13px] font-medium text-zinc-300 hover:text-white disabled:opacity-50">
              Cancelar
            </button>
            <button
              onClick={() => save("rascunho")}
              disabled={!!saving}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[13px] font-semibold text-amber-300 transition hover:bg-amber-500/15 disabled:opacity-50"
            >
              {saving === "rascunho" ? <Loader2 className="size-4 animate-spin" /> : null}
              Salvar rascunho
            </button>
            <PrimaryButton onClick={() => save("confirmada")} disabled={!!saving}>
              {saving === "confirmada" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Confirmar
            </PrimaryButton>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Detalhe                                                            */
/* ------------------------------------------------------------------ */

type Detail = {
  movement: Movement & {
    notes: string | null;
    sourceName: string | null;
    destName: string | null;
    confirmedAt: string | null;
  };
  items: {
    id: string;
    itemName: string | null;
    itemSku: string | null;
    itemUnit: string | null;
    quantity: string;
    unitCost: string | null;
    lotCode: string | null;
    expiryDate: string | null;
  }[];
};

function MovementDetail({
  id,
  onClose,
  onAsk,
}: {
  id: string | null;
  onClose: () => void;
  onAsk: (p: Pending) => void;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    if (!id) return;
    let alive = true;
    api<Detail>(`/api/movements/${id}`).then((r) => {
      if (!alive) return;
      if (r.ok) setData(r.data);
      else setError(r.error ?? "Erro ao carregar");
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (!id) return null;
  const m = data?.movement;

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={m?.code ?? "Detalhes"}
      subtitle={m ? `Registrada em ${formatDateTime(m.createdAt)}${m.confirmedAt ? ` · confirmada em ${formatDateTime(m.confirmedAt)}` : ""}` : "Carregando…"}
    >
      {error ? (
        <p className="py-8 text-center text-[13px] text-red-300">{error}</p>
      ) : !data || !m ? (
        <LoadingRows label="Carregando detalhes…" />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <MovStatus status={m.status} />
            <span className="text-[12.5px] text-zinc-400">
              {m.sourceName ? <>De <strong className="text-zinc-200">{m.sourceName}</strong> </> : null}
              {m.destName ? <>para <strong className="text-zinc-200">{m.destName}</strong></> : null}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
            <Info label="Data" value={formatDateBR(m.movementDate)} />
            <Info label="Responsável" value={m.responsible || "—"} />
            <Info label={m.type === "entrada" ? "Fornecedor / NF" : "Motivo"} value={m.type === "entrada" ? `${m.supplier || "—"}${m.invoiceNumber ? ` · ${m.invoiceNumber}` : ""}` : m.reason || "—"} />
            <Info label="Total" value={formatCurrency(m.totalCost)} />
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2.5">Item</th>
                  <th className="px-4 py-2.5 text-center">Qtd.</th>
                  <th className="px-4 py-2.5 text-right">Custo un.</th>
                  <th className="px-4 py-2.5">Lote</th>
                  <th className="px-4 py-2.5">Validade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {data.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{it.itemName}</p>
                      <p className="font-mono text-[11px] text-zinc-500">{it.itemSku} · {it.itemUnit}</p>
                    </td>
                    <td className="px-4 py-3 text-center text-zinc-200">{formatQty(it.quantity)}</td>
                    <td className="px-4 py-3 text-right text-zinc-300">{formatCurrency(it.unitCost)}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-zinc-400">{it.lotCode || "—"}</td>
                    <td className="px-4 py-3 text-[12px] text-zinc-400">{it.expiryDate ? formatDateBR(`${it.expiryDate}T12:00:00`) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {m.notes ? (
            <p className="whitespace-pre-line rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5 text-[13px] text-zinc-400">{m.notes}</p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2.5">
            {m.status === "rascunho" ? (
              <>
                <button onClick={() => onAsk({ id: m.id, code: m.code, action: "delete" })} className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-[13px] font-semibold text-red-300">
                  Excluir rascunho
                </button>
                <PrimaryButton onClick={() => onAsk({ id: m.id, code: m.code, action: "confirm" })}>
                  <CheckCircle2 className="size-4" /> Confirmar e atualizar saldo
                </PrimaryButton>
              </>
            ) : null}
            {m.status === "confirmada" ? (
              <button onClick={() => onAsk({ id: m.id, code: m.code, action: "reverse" })} className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-[13px] font-semibold text-amber-300">
                Estornar movimentação
              </button>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] p-3">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 truncate font-medium text-white" title={value}>{value}</p>
    </div>
  );
}
