"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Handshake,
  Plus,
  RefreshCw,
  Eye,
  Undo2,
  CalendarClock,
  XCircle,
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  CheckCircle2,
  Wallet,
  X,
  Pencil,
  Power,
  Phone,
  Loader2,
  Clock3,
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
import { cn } from "@/lib/cn";

type Direction = "pegamos" | "emprestamos";
type LoanRow = {
  id: string;
  code: string;
  direction: Direction;
  status: "aberto" | "parcial" | "quitado" | "cancelado";
  responsible: string | null;
  extensions: number;
  loanDate: string;
  dueDate: string;
  daysLeft: number;
  partnerId: string;
  partnerName: string;
  locationName: string;
  itemCount: number;
  totalQty: string;
  totalValue: string;
  outstandingQty: string;
  outstandingValue: string;
  itemsLabel: string | null;
};
type Stats = {
  toReceiveCount: number; toReceiveValue: number; toReturnCount: number; toReturnValue: number;
  overdue: number; dueSoon: number; settled: number; cancelled: number; total: number; partnersActive: number; loanDueDays: number;
};
type Partner = {
  id: string; name: string; contact: string | null; phone: string | null; email: string | null; notes: string | null; active: boolean;
  open_loans: number; overdue_loans: number; to_receive: string; to_return: string; total_loans: number;
};
type LocOpt = { id: string; name: string };
type ItemOpt = { id: string; name: string; sku: string; unit: string; costPrice: string; totalQty: string | number };
type Detail = {
  loan: LoanRow & { notes: string | null; cancelReason: string | null; settledAt: string | null; partnerContact: string | null; partnerPhone: string | null; locationId: string; openingMovement: { code: string; status: string } | null };
  items: { id: string; itemId: string; itemName: string; itemSku: string; unit: string; quantity: number; unitCost: number; lotCode: string | null; returnedQty: number; settledQty: number; outstandingQty: number; outstandingValue: number; available: number }[];
  returns: { id: string; kind: string; returnDate: string; responsible: string | null; notes: string | null; createdAt: string; movementCode: string | null; items: { loanItemId: string; quantity: number; itemName: string; unit: string }[] }[];
  events: { id: string; type: string; description: string; createdAt: string }[];
  totals: { quantity: number; value: number; outstandingQty: number; outstandingValue: number };
};

const EMPTY_STATS: Stats = { toReceiveCount: 0, toReceiveValue: 0, toReturnCount: 0, toReturnValue: 0, overdue: 0, dueSoon: 0, settled: 0, cancelled: 0, total: 0, partnersActive: 0, loanDueDays: 3 };
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function DirectionBadge({ d }: { d: Direction }) {
  return d === "emprestamos" ? (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-[11.5px] font-medium text-sky-300">
      <ArrowUpFromLine className="size-3.5" /> Emprestamos · a receber
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[11.5px] font-medium text-violet-300">
      <ArrowDownToLine className="size-3.5" /> Pegamos · a devolver
    </span>
  );
}

function DuePill({ daysLeft, status, dueDate }: { daysLeft: number; status: LoanRow["status"]; dueDate: string }) {
  if (status === "quitado" || status === "cancelado") {
    return <span className="text-[12.5px] text-zinc-500">{formatDateBR(dueDate)}</span>;
  }
  if (daysLeft < 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-red-500/25 bg-red-500/10 px-2 py-1 text-[11.5px] font-semibold text-red-300">
        <AlertTriangle className="size-3.5" /> Vencido há {Math.abs(daysLeft)} dia(s)
      </span>
    );
  }
  if (daysLeft === 0) {
    return <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[11.5px] font-semibold text-amber-300">Vence hoje</span>;
  }
  if (daysLeft <= 3) {
    return <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[11.5px] font-medium text-amber-300">Vence em {daysLeft} dia(s)</span>;
  }
  return <span className="text-[12.5px] text-zinc-300">{formatDateBR(dueDate)} <span className="text-zinc-600">· {daysLeft}d</span></span>;
}

function StatusBadge({ s }: { s: LoanRow["status"] }) {
  if (s === "aberto") return <StatusPill tone="yellow">Aberto</StatusPill>;
  if (s === "parcial") return <StatusPill tone="blue">Parcial</StatusPill>;
  if (s === "quitado") return <StatusPill tone="green">Quitado</StatusPill>;
  return <StatusPill tone="gray">Cancelado</StatusPill>;
}

export default function EmprestimosPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Carregando…</div>}>
      <EmprestimosInner />
    </Suspense>
  );
}

function EmprestimosInner() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const { push } = useToast();
  const { org, refreshAlerts } = useApp();
  const [rows, setRows] = useState<LoanRow[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState("open");
  const [direction, setDirection] = useState("all");
  const [partner, setPartner] = useState("all");
  const [newOpen, setNewOpen] = useState(false);
  const [partnersOpen, setPartnersOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const loadPartners = useCallback(async () => {
    const r = await api<{ partners: Partner[] }>("/api/partners");
    if (r.ok) setPartners(r.data.partners ?? []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<{ loans: LoanRow[]; stats: Stats }>(
      `/api/loans?q=${encodeURIComponent(q)}&status=${status}&direction=${direction}&partner=${partner}`
    );
    if (r.ok) {
      setRows(r.data.loans ?? []);
      setStats(r.data.stats ?? EMPTY_STATS);
    } else {
      push({ kind: "error", title: "Não foi possível carregar os empréstimos", msg: r.error });
    }
    setLoading(false);
  }, [q, status, direction, partner, push]);

  useEffect(() => {
    loadPartners();
  }, [loadPartners]);
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useEffect(() => {
    setQ(initialQ);
    if (initialQ) setStatus("all");
  }, [initialQ]);

  const refreshAll = () => {
    load();
    loadPartners();
    refreshAlerts();
  };

  const exportPdf = (print: boolean) =>
    pdfList<LoanRow>({
      org: org.name,
      title: "Empréstimos entre restaurantes",
      subtitle: "Posição de itens emprestados e pegados, com prazo e pendência.",
      landscape: true,
      print,
      kpis: [
        { label: "A receber", value: formatCurrency(stats.toReceiveValue), sub: stats.toReceiveCount + " empréstimo(s)" },
        { label: "A devolver", value: formatCurrency(stats.toReturnValue), sub: stats.toReturnCount + " empréstimo(s)" },
        { label: "Vencidos", value: String(stats.overdue), tone: stats.overdue > 0 ? "red" : "green" },
        { label: "Quitados", value: String(stats.settled) },
      ],
      columns: [
        { header: "Código", value: (l) => l.code },
        { header: "Parceiro", value: (l) => l.partnerName },
        { header: "Direção", value: (l) => (l.direction === "emprestamos" ? "Emprestamos (a receber)" : "Pegamos (a devolver)") },
        { header: "Itens", value: (l) => l.itemsLabel ?? "-" },
        { header: "Data", value: (l) => formatDateBR(l.loanDate) },
        { header: "Prazo", value: (l) => formatDateBR(l.dueDate) },
        { header: "Pendente", align: "right", value: (l) => formatQty(l.outstandingQty) },
        { header: "Valor pend.", align: "right", value: (l) => formatCurrency(l.outstandingValue) },
        { header: "Situação", align: "center", value: (l) => l.status },
      ],
      rows,
      rowTone: (l) => ((l.status === "aberto" || l.status === "parcial") && l.daysLeft < 0 ? "red" : null),
      filename: "emprestimos",
    });

  return (
    <div className="animate-fade-in">
      <p className="text-[12px] text-zinc-500">
        Movimentação <span className="mx-1.5 text-zinc-700">›</span> <span className="text-zinc-300">Empréstimos</span>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-[28px] font-bold tracking-tight text-white">Empréstimos</h2>
            <PageBadge>Entre restaurantes</PageBadge>
          </div>
          <p className="mt-1.5 text-[13.5px] text-zinc-400">
            Controle do que pegamos e do que emprestamos, com prazo, valor pendente e trilha de cada acerto.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={() => setPartnersOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[13px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white">
            <Users className="size-4" /> Parceiros
            <span className="rounded-md bg-white/10 px-1.5 text-[11px] font-semibold text-zinc-300">{stats.partnersActive}</span>
          </button>
          <PdfButton build={exportPdf} disabled={rows.length === 0} />
          <PrimaryButton onClick={() => setNewOpen(true)}>
            <Plus className="size-4" /> Novo empréstimo
          </PrimaryButton>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="A receber (emprestamos)" value={stats.toReceiveCount} hint={`${formatCurrency(stats.toReceiveValue)} pendentes de parceiros`} icon={<ArrowUpFromLine className="size-4" />} accent={stats.toReceiveCount > 0 ? <span className="size-1.5 rounded-full bg-sky-400" /> : null} />
        <StatCard label="A devolver (pegamos)" value={stats.toReturnCount} hint={`${formatCurrency(stats.toReturnValue)} que devemos devolver`} icon={<ArrowDownToLine className="size-4" />} accent={stats.toReturnCount > 0 ? <span className="size-1.5 rounded-full bg-violet-400" /> : null} />
        <StatCard label="Vencidos" value={stats.overdue} hint={stats.overdue > 0 ? "Cobrar ou devolver com urgência" : "Nenhum prazo estourado"} icon={<AlertTriangle className="size-4" />} accent={stats.overdue > 0 ? <span className="size-1.5 rounded-full bg-red-500" /> : null} />
        <StatCard label="Vencem em breve" value={stats.dueSoon} hint={`Próximos ${stats.loanDueDays} dia(s) · ${stats.settled} quitado(s) no total`} icon={<CalendarClock className="size-4" />} accent={stats.dueSoon > 0 ? <span className="size-1.5 rounded-full bg-amber-400" /> : null} />
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#141417]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div>
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-white">
              Histórico de empréstimos
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-300">{rows.length}</span>
            </h3>
            <p className="mt-0.5 text-[12.5px] text-zinc-500">Cada empréstimo gera movimentação no saldo e só fecha quando a pendência zera.</p>
          </div>
          <button onClick={refreshAll} className="flex items-center gap-1.5 text-[12.5px] font-medium text-zinc-400 transition hover:text-white">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>

        <div className="flex flex-col gap-2.5 px-5 py-4 lg:flex-row">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por código, parceiro, responsável ou item…" />
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Select value={direction} onChange={setDirection} className="sm:w-[190px]" options={[{ value: "all", label: "Ambas as direções" }, { value: "emprestamos", label: "Emprestamos (a receber)" }, { value: "pegamos", label: "Pegamos (a devolver)" }]} />
            <Select value={partner} onChange={setPartner} className="sm:w-[200px]" options={[{ value: "all", label: "Todos os parceiros" }, ...partners.map((p) => ({ value: p.id, label: p.name }))]} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pr-5">
          <div className="min-w-0 flex-1">
            <Tabs
              active={status}
              onChange={setStatus}
              tabs={[
                { value: "open", label: "Em aberto", count: stats.toReceiveCount + stats.toReturnCount },
                { value: "overdue", label: "Vencidos", count: stats.overdue },
                { value: "quitado", label: "Quitados", count: stats.settled },
                { value: "cancelado", label: "Cancelados", count: stats.cancelled },
                { value: "all", label: "Todos", count: stats.total },
              ]}
            />
          </div>
          <p className="hidden shrink-0 text-[11.5px] text-zinc-600 md:block">Devoluções imutáveis · acertos justificados</p>
        </div>

        {loading && rows.length === 0 ? (
          <LoadingRows label="Carregando empréstimos…" />
        ) : (
          <div className={loading ? "opacity-60 transition" : "transition"}>
            <TableShell
              head={
                <>
                  <Th>Empréstimo / Parceiro</Th>
                  <Th>Direção</Th>
                  <Th>Itens</Th>
                  <Th>Pendente</Th>
                  <Th>Prazo</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Ações</Th>
                </>
              }
              empty={rows.length === 0}
            >
              {rows.length === 0 ? (
                <EmptyState
                  icon={<Handshake className="size-7" />}
                  title={status === "open" ? "Nenhum empréstimo em aberto" : "Nenhum empréstimo encontrado"}
                  description={
                    partners.length === 0
                      ? "Cadastre o restaurante parceiro e registre o primeiro empréstimo. O saldo é ajustado automaticamente."
                      : "Registre o que pegou ou emprestou para acompanhar prazo, valor pendente e devoluções."
                  }
                  action={
                    partners.length === 0 ? (
                      <PrimaryButton onClick={() => setPartnersOpen(true)}><Users className="size-4" /> Cadastrar parceiro</PrimaryButton>
                    ) : (
                      <PrimaryButton onClick={() => setNewOpen(true)}><Plus className="size-4" /> Novo empréstimo</PrimaryButton>
                    )
                  }
                />
              ) : (
                rows.map((l) => {
                  const open = l.status === "aberto" || l.status === "parcial";
                  const pendQty = Number(l.outstandingQty);
                  const pendVal = Number(l.outstandingValue);
                  const pct = Number(l.totalQty) > 0 ? Math.round(((Number(l.totalQty) - pendQty) / Number(l.totalQty)) * 100) : 0;
                  return (
                    <tr key={l.id} className={cn("transition hover:bg-white/[0.02]", open && l.daysLeft < 0 ? "bg-red-500/[0.03]" : "")}>
                      <Td>
                        <button onClick={() => setDetailId(l.id)} className="text-left">
                          <p className="font-mono text-[12.5px] font-semibold text-white hover:underline">{l.code}</p>
                          <p className="mt-0.5 text-[13px] font-medium text-zinc-200">{l.partnerName}</p>
                          <p className="max-w-[260px] truncate text-[11.5px] text-zinc-500">{l.locationName}{l.extensions > 0 ? ` · ${l.extensions} prorrogação(ões)` : ""}</p>
                        </button>
                      </Td>
                      <Td><DirectionBadge d={l.direction} /></Td>
                      <Td>
                        <p className="text-[12.5px] text-zinc-300">{l.itemCount} {l.itemCount === 1 ? "item" : "itens"} · {formatQty(l.totalQty)} un.</p>
                        <p className="max-w-[220px] truncate text-[11.5px] text-zinc-500" title={l.itemsLabel ?? ""}>{l.itemsLabel}</p>
                      </Td>
                      <Td>
                        {open ? (
                          <div className="min-w-[120px]">
                            <p className="text-[13px] font-semibold text-white">{formatQty(pendQty)} un. <span className="text-[11.5px] font-normal text-zinc-500">· {formatCurrency(pendVal)}</span></p>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
                            </div>
                            <p className="mt-0.5 text-[10.5px] text-zinc-600">{pct}% acertado</p>
                          </div>
                        ) : (
                          <span className="text-[12.5px] text-zinc-500">{l.status === "quitado" ? `Total ${formatCurrency(l.totalValue)}` : "—"}</span>
                        )}
                      </Td>
                      <Td><DuePill daysLeft={l.daysLeft} status={l.status} dueDate={l.dueDate} /></Td>
                      <Td><StatusBadge s={l.status} /></Td>
                      <Td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <IconBtn title="Ver detalhes e trilha" onClick={() => setDetailId(l.id)}><Eye className="size-4" /></IconBtn>
                          {open ? (
                            <IconBtn title={l.direction === "pegamos" ? "Registrar devolução" : "Registrar recebimento"} onClick={() => setDetailId(l.id)}><Undo2 className="size-4" /></IconBtn>
                          ) : null}
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

      <NewLoanModal open={newOpen} partners={partners.filter((p) => p.active)} onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); refreshAll(); }} onNewPartner={() => { setNewOpen(false); setPartnersOpen(true); }} />
      <PartnersModal open={partnersOpen} partners={partners} onClose={() => setPartnersOpen(false)} onChanged={() => { loadPartners(); load(); }} />
      <LoanDetailModal id={detailId} onClose={() => setDetailId(null)} onChanged={refreshAll} />
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

/* ---------------------------------------------------------------- Novo empréstimo */

type LineState = { itemId: string; quantity: string; unitCost: string; lotCode: string };
const emptyLine = (): LineState => ({ itemId: "", quantity: "1", unitCost: "", lotCode: "" });

function NewLoanModal({ open, partners, onClose, onSaved, onNewPartner }: { open: boolean; partners: Partner[]; onClose: () => void; onSaved: () => void; onNewPartner: () => void }) {
  const { push } = useToast();
  const [direction, setDirection] = useState<Direction>("emprestamos");
  const [partnerId, setPartnerId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [loanDate, setLoanDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(plusDays(7));
  const [responsible, setResponsible] = useState("Operador de Estoque");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);
  const [locs, setLocs] = useState<LocOpt[]>([]);
  const [items, setItems] = useState<ItemOpt[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDirection("emprestamos"); setPartnerId(partners[0]?.id ?? ""); setLocationId(""); setLoanDate(todayIso()); setDueDate(plusDays(7));
    setResponsible("Operador de Estoque"); setNotes(""); setLines([emptyLine()]);
    api<{ locations: LocOpt[] }>("/api/locations?status=active").then((r) => {
      if (r.ok) {
        const ls = (r.data.locations ?? []).map((l) => ({ id: l.id, name: l.name }));
        setLocs(ls);
        setLocationId((cur) => cur || ls[0]?.id || "");
      }
    });
    api<{ items: ItemOpt[] }>("/api/items?status=active").then((r) => { if (r.ok) setItems(r.data.items ?? []); });
  }, [open, partners]);

  useEffect(() => {
    if (!open || !locationId) { setBalances({}); return; }
    api<{ balances: { itemId: string; quantity: string }[] }>(`/api/stock?locationId=${locationId}`).then((r) => {
      if (!r.ok) return;
      const m: Record<string, number> = {};
      for (const b of r.data.balances ?? []) m[b.itemId] = Number(b.quantity);
      setBalances(m);
    });
  }, [open, locationId]);

  const total = useMemo(() => lines.reduce((a, l) => a + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0), [lines]);
  const daysSpan = useMemo(() => Math.round((new Date(`${dueDate}T12:00:00`).getTime() - new Date(`${loanDate}T12:00:00`).getTime()) / 86_400_000), [loanDate, dueDate]);

  if (!open) return null;

  const setLine = (i: number, patch: Partial<LineState>) => setLines((p) => p.map((x, xi) => (xi === i ? { ...x, ...patch } : x)));
  const pickItem = (i: number, itemId: string) => {
    const it = items.find((x) => x.id === itemId);
    setLine(i, { itemId, unitCost: it ? String(Number(it.costPrice ?? 0)) : "" });
  };

  const save = async () => {
    if (saving) return;
    if (!partnerId) return push({ kind: "error", title: "Selecione o parceiro" });
    if (!locationId) return push({ kind: "error", title: "Selecione o local" });
    if (dueDate < loanDate) return push({ kind: "error", title: "Prazo anterior à data do empréstimo" });
    const valid = lines.filter((l) => l.itemId && Number(l.quantity) > 0);
    if (valid.length === 0) return push({ kind: "error", title: "Adicione ao menos um item com quantidade" });
    const ids = valid.map((l) => l.itemId);
    if (new Set(ids).size !== ids.length) return push({ kind: "error", title: "Item repetido", msg: "Some as quantidades em uma linha só." });
    if (direction === "emprestamos") {
      for (const l of valid) {
        const av = balances[l.itemId] ?? 0;
        if (Number(l.quantity) > av + 0.0005) {
          const it = items.find((x) => x.id === l.itemId);
          return push({ kind: "error", title: `Saldo insuficiente: ${it?.name ?? "item"}`, msg: `Disponível no local: ${formatQty(av)} ${it?.unit ?? ""}` });
        }
      }
    }
    setSaving(true);
    const r = await api<{ loan: { code: string; movementCode: string } }>("/api/loans", {
      method: "POST",
      json: { direction, partnerId, locationId, loanDate, dueDate, responsible, notes, items: valid.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), unitCost: Number(l.unitCost) || 0, lotCode: l.lotCode })) },
    });
    setSaving(false);
    if (r.ok) {
      push({ kind: "success", title: `Empréstimo ${r.data.loan.code} registrado`, msg: `Saldo atualizado pela movimentação ${r.data.loan.movementCode}.` });
      onSaved();
    } else {
      push({ kind: "error", title: "Não foi possível registrar", msg: r.error });
    }
  };

  return (
    <Modal open onClose={saving ? () => {} : onClose} wide title="Novo empréstimo" subtitle="Escolha a direção — o saldo do local é ajustado na hora">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button onClick={() => setDirection("emprestamos")} className={cn("rounded-xl border p-4 text-left transition", direction === "emprestamos" ? "border-sky-500/40 bg-sky-500/10" : "border-white/[0.08] bg-white/[0.015] hover:border-white/20")}>
            <p className="flex items-center gap-2 text-[14px] font-semibold text-white"><ArrowUpFromLine className="size-4 text-sky-300" /> Emprestamos</p>
            <p className="mt-1 text-[12.5px] text-zinc-400">Cedemos insumos ao parceiro. <strong className="text-zinc-200">Sai do saldo</strong> e fica a receber até a devolução.</p>
          </button>
          <button onClick={() => setDirection("pegamos")} className={cn("rounded-xl border p-4 text-left transition", direction === "pegamos" ? "border-violet-500/40 bg-violet-500/10" : "border-white/[0.08] bg-white/[0.015] hover:border-white/20")}>
            <p className="flex items-center gap-2 text-[14px] font-semibold text-white"><ArrowDownToLine className="size-4 text-violet-300" /> Pegamos emprestado</p>
            <p className="mt-1 text-[12.5px] text-zinc-400">Recebemos insumos do parceiro. <strong className="text-zinc-200">Entra no saldo</strong> e fica a devolver no prazo.</p>
          </button>
        </div>

        {partners.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-[13px] text-amber-200">
            Nenhum parceiro ativo cadastrado.
            <button onClick={onNewPartner} className="rounded-lg bg-amber-400/20 px-3 py-1.5 font-semibold text-amber-100 hover:bg-amber-400/30">Cadastrar parceiro</button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Restaurante parceiro" required>
            <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className={inputCls}>
              <option value="" className="bg-zinc-900">Selecionar…</option>
              {partners.map((p) => <option key={p.id} value={p.id} className="bg-zinc-900">{p.name}</option>)}
            </select>
          </Field>
          <Field label={direction === "pegamos" ? "Local onde vai entrar" : "Local de onde vai sair"} required>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls}>
              <option value="" className="bg-zinc-900">Selecionar…</option>
              {locs.map((l) => <option key={l.id} value={l.id} className="bg-zinc-900">{l.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Data do empréstimo" required>
            <input type="date" value={loanDate} max={todayIso()} onChange={(e) => setLoanDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label={direction === "pegamos" ? "Prazo para devolvermos" : "Prazo para cobrarmos"} required hint={daysSpan >= 0 ? `${daysSpan} dia(s) de prazo` : "prazo inválido"}>
            <input type="date" value={dueDate} min={loanDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Responsável">
            <input value={responsible} maxLength={80} onChange={(e) => setResponsible(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[3, 7, 15, 30].map((d) => (
            <button key={d} onClick={() => setDueDate(plusDays(d))} className={cn("rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition", dueDate === plusDays(d) ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-zinc-400 hover:text-white")}>
              +{d} dias
            </button>
          ))}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12.5px] font-medium text-zinc-400">Itens emprestados</p>
            <button onClick={() => setLines((p) => [...p, emptyLine()])} className="text-[12.5px] font-semibold text-zinc-200 hover:text-white">+ Adicionar linha</button>
          </div>
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-[12.5px] text-zinc-500">Nenhum item ativo cadastrado. Cadastre itens antes de registrar empréstimos.</p>
          ) : null}
          <div className="space-y-2">
            {lines.map((l, i) => {
              const av = l.itemId ? balances[l.itemId] : undefined;
              const over = direction === "emprestamos" && av !== undefined && Number(l.quantity) > av + 0.0005;
              const it = items.find((x) => x.id === l.itemId);
              return (
                <div key={i} className={cn("rounded-xl border p-2.5", over ? "border-red-500/30 bg-red-500/[0.04]" : "border-white/[0.07] bg-white/[0.015]")}>
                  <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_90px_110px_120px_36px]">
                    <div className="min-w-0">
                      <select value={l.itemId} onChange={(e) => pickItem(i, e.target.value)} className={inputCls}>
                        <option value="" className="bg-zinc-900">Selecionar item…</option>
                        {items.map((it2) => <option key={it2.id} value={it2.id} className="bg-zinc-900">{it2.name} · {it2.unit}</option>)}
                      </select>
                      {l.itemId && av !== undefined ? (
                        <p className={cn("mt-1 text-[11px]", over ? "font-semibold text-red-400" : "text-zinc-500")}>
                          Saldo no local: {formatQty(av)} {it?.unit}{over ? " — insuficiente para emprestar" : ""}
                        </p>
                      ) : null}
                    </div>
                    <input type="number" inputMode="decimal" min="0" step="0.001" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} placeholder="Qtd" className={`${inputCls} px-2 text-center`} />
                    <input type="number" inputMode="decimal" min="0" step="0.01" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} placeholder="R$ unit." title="Valor unitário de referência" className={`${inputCls} px-2 text-center`} />
                    <input value={l.lotCode} maxLength={60} onChange={(e) => setLine(i, { lotCode: e.target.value })} placeholder="Lote" className={`${inputCls} px-2`} />
                    <button onClick={() => setLines((p) => p.filter((_, xi) => xi !== i))} disabled={lines.length === 1} className="grid size-9 place-items-center rounded-lg border border-white/[0.08] text-zinc-500 hover:text-red-400 disabled:opacity-30"><X className="size-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11.5px] text-zinc-600">Valor unitário serve para medir a pendência em R$. Vazio = custo médio do item.</p>
        </div>

        <Field label="Observações">
          <textarea value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Combinados, condições de devolução, quem autorizou…" className={`${inputCls} resize-none`} />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 text-[13px]">
          <span className="text-zinc-400">
            {direction === "pegamos" ? "Ficaremos devendo" : "Ficarão nos devendo"} <strong className="text-white">{formatCurrency(total)}</strong> em insumos
          </span>
          <span className="text-zinc-500">Prazo: <strong className="text-zinc-200">{formatDateBR(dueDate)}</strong></span>
        </div>
        <div className="flex justify-end gap-2.5">
          <button onClick={onClose} disabled={saving} className="rounded-lg border border-white/10 px-4 py-2.5 text-[13px] font-medium text-zinc-300 hover:text-white disabled:opacity-50">Cancelar</button>
          <PrimaryButton onClick={save} disabled={saving || partners.length === 0 || items.length === 0}>{saving ? "Registrando…" : "Registrar empréstimo"}</PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- Detalhe */

function LoanDetailModal({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { push } = useToast();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "return" | "extend" | "cancel">("view");
  const [busy, setBusy] = useState(false);
  // devolução
  const [kind, setKind] = useState<"devolucao" | "baixa">("devolucao");
  const [retDate, setRetDate] = useState(todayIso());
  const [retResp, setRetResp] = useState("Operador de Estoque");
  const [retNotes, setRetNotes] = useState("");
  const [retQty, setRetQty] = useState<Record<string, string>>({});
  // prorrogar / cancelar
  const [newDue, setNewDue] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    const r = await api<Detail>(`/api/loans/${id}`);
    if (r.ok) {
      setData(r.data);
      const init: Record<string, string> = {};
      for (const it of r.data.items) init[it.id] = it.outstandingQty > 0 ? String(it.outstandingQty) : "";
      setRetQty(init);
      setNewDue(r.data.loan.dueDate);
    } else setError(r.error ?? "Erro ao carregar");
  }, [id]);

  useEffect(() => {
    setData(null); setError(null); setMode("view"); setKind("devolucao"); setRetDate(todayIso()); setRetNotes(""); setReason("");
    load();
  }, [id, load]);

  if (!id) return null;
  const loan = data?.loan;
  const open = loan?.status === "aberto" || loan?.status === "parcial";

  const submitReturn = async () => {
    if (!data || busy) return;
    const lines = data.items.map((it) => ({ loanItemId: it.id, quantity: Number(retQty[it.id] || 0) })).filter((l) => l.quantity > 0);
    if (lines.length === 0) return push({ kind: "error", title: "Informe ao menos uma quantidade" });
    for (const l of lines) {
      const it = data.items.find((x) => x.id === l.loanItemId)!;
      if (l.quantity > it.outstandingQty + 0.0005) return push({ kind: "error", title: `${it.itemName}: excede o pendente`, msg: `Pendente: ${formatQty(it.outstandingQty)} ${it.unit}` });
      if (kind === "devolucao" && loan?.direction === "pegamos" && l.quantity > it.available + 0.0005) {
        return push({ kind: "error", title: `${it.itemName}: sem saldo para devolver`, msg: `No local há ${formatQty(it.available)} ${it.unit}. Reponha ou registre um acerto.` });
      }
    }
    if (kind === "baixa" && retNotes.trim().length < 3) return push({ kind: "error", title: "Acerto exige justificativa" });
    setBusy(true);
    const r = await api<Detail & { result: { status: string; movementCode: string | null } }>(`/api/loans/${id}/returns`, { method: "POST", json: { kind, returnDate: retDate, responsible: retResp, notes: retNotes, lines } });
    setBusy(false);
    if (r.ok) {
      push({ kind: "success", title: r.data.result.status === "quitado" ? "Empréstimo quitado" : "Acerto registrado", msg: r.data.result.movementCode ? `Movimentação ${r.data.result.movementCode} aplicada no saldo.` : "Pendência atualizada." });
      setMode("view"); setRetNotes("");
      load(); onChanged();
    } else push({ kind: "error", title: "Não foi possível registrar", msg: r.error });
  };

  const submitExtend = async () => {
    if (busy) return;
    setBusy(true);
    const r = await api(`/api/loans/${id}`, { method: "PATCH", json: { action: "extend", dueDate: newDue, reason } });
    setBusy(false);
    if (r.ok) { push({ kind: "success", title: "Prazo prorrogado", msg: `Novo prazo: ${formatDateBR(newDue)}` }); setMode("view"); setReason(""); load(); onChanged(); }
    else push({ kind: "error", title: "Não foi possível prorrogar", msg: r.error });
  };

  const submitCancel = async () => {
    if (busy) return;
    if (!confirm("Cancelar este empréstimo? O saldo será revertido e a ação fica registrada na trilha.")) return;
    setBusy(true);
    const r = await api(`/api/loans/${id}`, { method: "PATCH", json: { action: "cancel", reason } });
    setBusy(false);
    if (r.ok) { push({ kind: "success", title: "Empréstimo cancelado", msg: "Saldo revertido." }); setMode("view"); setReason(""); load(); onChanged(); }
    else push({ kind: "error", title: "Não foi possível cancelar", msg: r.error });
  };

  const retTotal = data ? data.items.reduce((a, it) => a + (Number(retQty[it.id]) || 0) * it.unitCost, 0) : 0;

  return (
    <Modal open onClose={busy ? () => {} : onClose} wide title={loan ? `${loan.code} · ${loan.partnerName}` : "Empréstimo"} subtitle={loan ? `${loan.direction === "pegamos" ? "Pegamos emprestado" : "Emprestamos"} · ${loan.locationName} · registrado em ${formatDateBR(loan.loanDate)}` : "Carregando…"}>
      {error ? <p className="py-8 text-center text-[13px] text-red-300">{error}</p> : !data || !loan ? <LoadingRows label="Carregando empréstimo…" /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge s={loan.status} />
            <DirectionBadge d={loan.direction} />
            <DuePill daysLeft={loan.daysLeft} status={loan.status} dueDate={loan.dueDate} />
            {loan.extensions > 0 ? <span className="text-[11.5px] text-zinc-500">{loan.extensions} prorrogação(ões)</span> : null}
            {loan.openingMovement ? <span className="ml-auto font-mono text-[11.5px] text-zinc-500">mov. {loan.openingMovement.code}{loan.openingMovement.status === "estornada" ? " (estornada)" : ""}</span> : null}
          </div>

          <div className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
            <Info label="Valor total" value={formatCurrency(data.totals.value)} />
            <Info label={loan.direction === "pegamos" ? "Devemos devolver" : "Temos a receber"} value={formatCurrency(data.totals.outstandingValue)} tone={data.totals.outstandingValue > 0 ? (loan.daysLeft < 0 && open ? "red" : "white") : "green"} />
            <Info label="Prazo" value={formatDateBR(loan.dueDate)} />
            <Info label="Contato" value={loan.partnerContact || loan.partnerPhone || "—"} sub={loan.partnerContact && loan.partnerPhone ? loan.partnerPhone : undefined} />
          </div>
          {loan.notes ? <p className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5 text-[12.5px] text-zinc-400">{loan.notes}</p> : null}
          {loan.cancelReason ? <p className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-3.5 text-[12.5px] text-red-200">Cancelado: {loan.cancelReason}</p> : null}

          <div className="overflow-hidden rounded-xl border border-white/[0.07]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[11px] uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-2.5">Item</th>
                    <th className="px-4 py-2.5 text-right">Emprestado</th>
                    <th className="px-4 py-2.5 text-right">Devolvido</th>
                    <th className="px-4 py-2.5 text-right">Acertado</th>
                    <th className="px-4 py-2.5 text-right">Pendente</th>
                    {mode === "return" ? <th className="px-4 py-2.5 text-right">{kind === "devolucao" ? "Devolver agora" : "Baixar agora"}</th> : <th className="px-4 py-2.5 text-right">Valor pend.</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {data.items.map((it) => {
                    const short = loan.direction === "pegamos" && open && it.outstandingQty > it.available + 0.0005;
                    return (
                      <tr key={it.id}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-white">{it.itemName}</p>
                          <p className="font-mono text-[11px] text-zinc-500">{it.itemSku}{it.lotCode ? ` · lote ${it.lotCode}` : ""} · {formatCurrency(it.unitCost)}/{it.unit}</p>
                          {short ? <p className="mt-0.5 text-[11px] font-medium text-amber-300">Saldo no local: {formatQty(it.available)} {it.unit} — insuficiente para devolver tudo</p> : null}
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-300">{formatQty(it.quantity)} {it.unit}</td>
                        <td className="px-4 py-2.5 text-right text-emerald-300">{it.returnedQty > 0 ? formatQty(it.returnedQty) : "—"}</td>
                        <td className="px-4 py-2.5 text-right text-sky-300">{it.settledQty > 0 ? formatQty(it.settledQty) : "—"}</td>
                        <td className={cn("px-4 py-2.5 text-right font-semibold", it.outstandingQty > 0 ? "text-white" : "text-zinc-600")}>{formatQty(it.outstandingQty)}</td>
                        {mode === "return" ? (
                          <td className="px-4 py-2.5 text-right">
                            <input type="number" inputMode="decimal" min="0" max={it.outstandingQty} step="0.001" value={retQty[it.id] ?? ""} disabled={it.outstandingQty <= 0} onChange={(e) => setRetQty((p) => ({ ...p, [it.id]: e.target.value }))} className={`${inputCls} w-[110px] px-2 text-right disabled:opacity-40`} />
                          </td>
                        ) : (
                          <td className="px-4 py-2.5 text-right text-zinc-300">{formatCurrency(it.outstandingValue)}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {mode === "return" ? (
            <div className="animate-fade-in space-y-3 rounded-xl border border-white/[0.1] bg-white/[0.02] p-4">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button onClick={() => setKind("devolucao")} className={cn("rounded-lg border p-3 text-left transition", kind === "devolucao" ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/10 hover:border-white/20")}>
                  <p className="text-[13px] font-semibold text-white">Devolução física</p>
                  <p className="text-[11.5px] text-zinc-400">{loan.direction === "pegamos" ? "Entregamos os itens de volta — sai do nosso saldo." : "Parceiro devolveu os itens — entra no nosso saldo."}</p>
                </button>
                <button onClick={() => setKind("baixa")} className={cn("rounded-lg border p-3 text-left transition", kind === "baixa" ? "border-sky-500/40 bg-sky-500/10" : "border-white/10 hover:border-white/20")}>
                  <p className="text-[13px] font-semibold text-white">Acerto sem retorno físico</p>
                  <p className="text-[11.5px] text-zinc-400">Pago em dinheiro, reposto por outro item ou perdoado. Não mexe no saldo; exige justificativa.</p>
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Data"><input type="date" value={retDate} min={loan.loanDate} max={todayIso()} onChange={(e) => setRetDate(e.target.value)} className={inputCls} /></Field>
                <Field label="Responsável"><input value={retResp} maxLength={80} onChange={(e) => setRetResp(e.target.value)} className={inputCls} /></Field>
                <Field label={kind === "baixa" ? "Justificativa" : "Observação"} required={kind === "baixa"}><input value={retNotes} maxLength={500} onChange={(e) => setRetNotes(e.target.value)} placeholder={kind === "baixa" ? "Ex.: pago R$ 120 em dinheiro" : "Opcional"} className={inputCls} /></Field>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12.5px] text-zinc-400">Acertando agora: <strong className="text-white">{formatCurrency(retTotal)}</strong> · restará <strong className="text-white">{formatCurrency(Math.max(0, data.totals.outstandingValue - retTotal))}</strong></p>
                <div className="flex gap-2">
                  <button onClick={() => setMode("view")} disabled={busy} className="rounded-lg border border-white/10 px-3.5 py-2 text-[12.5px] font-medium text-zinc-300 hover:text-white">Voltar</button>
                  <PrimaryButton onClick={submitReturn} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} {kind === "devolucao" ? "Confirmar devolução" : "Confirmar acerto"}</PrimaryButton>
                </div>
              </div>
            </div>
          ) : mode === "extend" ? (
            <div className="animate-fade-in space-y-3 rounded-xl border border-white/[0.1] bg-white/[0.02] p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr]">
                <Field label="Novo prazo" required><input type="date" value={newDue} min={loan.dueDate} onChange={(e) => setNewDue(e.target.value)} className={inputCls} /></Field>
                <Field label="Justificativa" required><input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: parceiro pediu mais uma semana; entrega do fornecedor atrasou" className={inputCls} /></Field>
              </div>
              <p className="text-[11.5px] text-zinc-500">Prorrogação {loan.extensions + 1} de 5. O prazo atual é {formatDateBR(loan.dueDate)}.</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setMode("view")} disabled={busy} className="rounded-lg border border-white/10 px-3.5 py-2 text-[12.5px] font-medium text-zinc-300 hover:text-white">Voltar</button>
                <PrimaryButton onClick={submitExtend} disabled={busy || !newDue || newDue <= loan.dueDate || reason.trim().length < 3}>{busy ? "Salvando…" : "Prorrogar prazo"}</PrimaryButton>
              </div>
            </div>
          ) : mode === "cancel" ? (
            <div className="animate-fade-in space-y-3 rounded-xl border border-red-500/25 bg-red-500/[0.04] p-4">
              <p className="text-[13px] text-red-100">O cancelamento desfaz o efeito no saldo ({loan.direction === "pegamos" ? "retira o que havia entrado" : "devolve o que havia saído"}) e só é permitido antes de qualquer devolução ou acerto.</p>
              <Field label="Motivo do cancelamento" required><input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: lançado em duplicidade; negociação desfeita" className={inputCls} /></Field>
              <div className="flex justify-end gap-2">
                <button onClick={() => setMode("view")} disabled={busy} className="rounded-lg border border-white/10 px-3.5 py-2 text-[12.5px] font-medium text-zinc-300 hover:text-white">Voltar</button>
                <button onClick={submitCancel} disabled={busy || reason.trim().length < 3} className="rounded-lg border border-red-500/30 bg-red-500/15 px-4 py-2 text-[13px] font-semibold text-red-200 hover:bg-red-500/25 disabled:opacity-50">{busy ? "Cancelando…" : "Confirmar cancelamento"}</button>
              </div>
            </div>
          ) : open ? (
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => { setReason(""); setMode("cancel"); }} disabled={data.returns.length > 0} title={data.returns.length > 0 ? "Já houve devolução/acerto — não pode cancelar" : ""} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3.5 py-2.5 text-[13px] font-medium text-zinc-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"><XCircle className="size-4" /> Cancelar</button>
              <button onClick={() => { setReason(""); setNewDue(plusDays(7) > loan.dueDate ? plusDays(7) : loan.dueDate); setMode("extend"); }} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3.5 py-2.5 text-[13px] font-medium text-zinc-300 hover:text-white"><CalendarClock className="size-4" /> Prorrogar prazo</button>
              <PrimaryButton onClick={() => setMode("return")}><Undo2 className="size-4" /> {loan.direction === "pegamos" ? "Registrar devolução" : "Registrar recebimento"}</PrimaryButton>
            </div>
          ) : null}

          {data.returns.length > 0 ? (
            <div>
              <p className="mb-2 text-[12.5px] font-semibold text-zinc-300">Devoluções e acertos</p>
              <div className="space-y-2">
                {data.returns.map((r) => (
                  <div key={r.id} className="rounded-xl border border-white/[0.07] bg-white/[0.015] px-4 py-3 text-[12.5px]">
                    <div className="flex flex-wrap items-center gap-2">
                      {r.kind === "devolucao" ? <StatusPill tone="green">Devolução física</StatusPill> : <StatusPill tone="blue">Acerto sem retorno</StatusPill>}
                      <span className="text-zinc-400">{formatDateBR(r.returnDate)} · {r.responsible}</span>
                      {r.movementCode ? <span className="ml-auto font-mono text-[11.5px] text-zinc-500">mov. {r.movementCode}</span> : null}
                    </div>
                    <p className="mt-1.5 text-zinc-300">{r.items.map((it) => `${formatQty(it.quantity)} ${it.unit} ${it.itemName}`).join(" · ")}</p>
                    {r.notes ? <p className="mt-1 text-zinc-500">{r.notes}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-zinc-300"><Clock3 className="size-3.5 text-zinc-500" /> Trilha de auditoria</p>
            <ol className="space-y-1.5 border-l border-white/[0.08] pl-4">
              {data.events.map((e) => (
                <li key={e.id} className="relative text-[12.5px]">
                  <span className={cn("absolute -left-[21px] top-1.5 size-2 rounded-full", e.type === "quitado" ? "bg-emerald-400" : e.type === "cancelado" ? "bg-red-400" : e.type === "prorrogado" ? "bg-amber-400" : "bg-zinc-500")} />
                  <span className="text-zinc-500">{formatDateTime(e.createdAt)} · </span>
                  <span className="text-zinc-300">{e.description}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Info({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "red" | "green" | "white" }) {
  return (
    <div className="rounded-xl border border-white/[0.07] p-3">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={cn("mt-1 truncate font-semibold", tone === "red" ? "text-red-300" : tone === "green" ? "text-emerald-300" : "text-white")}>{value}</p>
      {sub ? <p className="truncate text-[11.5px] text-zinc-500">{sub}</p> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- Parceiros */

function PartnersModal({ open, partners, onClose, onChanged }: { open: boolean; partners: Partner[]; onClose: () => void; onChanged: () => void }) {
  const { push } = useToast();
  const [editing, setEditing] = useState<Partial<Partner> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!open) setEditing(null); }, [open]);
  if (!open) return null;

  const save = async () => {
    if (!editing || saving) return;
    if (!editing.name?.trim()) return push({ kind: "error", title: "Informe o nome do parceiro" });
    setSaving(true);
    const r = editing.id
      ? await api(`/api/partners/${editing.id}`, { method: "PATCH", json: editing })
      : await api("/api/partners", { method: "POST", json: editing });
    setSaving(false);
    if (r.ok) { push({ kind: "success", title: editing.id ? "Parceiro atualizado" : "Parceiro cadastrado", msg: editing.name }); setEditing(null); onChanged(); }
    else push({ kind: "error", title: "Não foi possível salvar", msg: r.error });
  };
  const toggle = async (p: Partner) => {
    const r = await api(`/api/partners/${p.id}`, { method: "PATCH", json: { active: !p.active } });
    if (r.ok) { push({ kind: "success", title: p.active ? "Parceiro inativado" : "Parceiro reativado" }); onChanged(); }
    else push({ kind: "error", title: "Não foi possível alterar", msg: r.error });
  };

  return (
    <Modal open onClose={onClose} wide title="Restaurantes parceiros" subtitle="Posição consolidada: quanto cada parceiro nos deve e quanto devemos a ele">
      <div className="space-y-4">
        {editing ? (
          <div className="animate-fade-in space-y-3 rounded-xl border border-white/[0.1] bg-white/[0.02] p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nome do restaurante" required><input value={editing.name ?? ""} maxLength={120} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ex.: Sushi do Porto" className={inputCls} /></Field>
              <Field label="Pessoa de contato"><input value={editing.contact ?? ""} maxLength={120} onChange={(e) => setEditing({ ...editing, contact: e.target.value })} className={inputCls} /></Field>
              <Field label="Telefone / WhatsApp"><input value={editing.phone ?? ""} maxLength={40} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} className={inputCls} /></Field>
              <Field label="E-mail"><input value={editing.email ?? ""} maxLength={120} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className={inputCls} /></Field>
            </div>
            <Field label="Observações"><input value={editing.notes ?? ""} maxLength={500} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Condições combinadas, horário de retirada…" className={inputCls} /></Field>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border border-white/10 px-3.5 py-2 text-[12.5px] font-medium text-zinc-300 hover:text-white">Cancelar</button>
              <PrimaryButton onClick={save} disabled={saving}>{saving ? "Salvando…" : editing.id ? "Salvar alterações" : "Cadastrar parceiro"}</PrimaryButton>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <PrimaryButton onClick={() => setEditing({ name: "", active: true })}><Plus className="size-4" /> Novo parceiro</PrimaryButton>
          </div>
        )}

        {partners.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-[13px] text-zinc-500">Nenhum parceiro cadastrado ainda.</p>
        ) : (
          <div className="space-y-2">
            {partners.map((p) => (
              <div key={p.id} className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-3.5", p.active ? "border-white/[0.07] bg-white/[0.015]" : "border-white/[0.05] opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[13.5px] font-semibold text-white">{p.name} {!p.active ? <StatusPill tone="gray">Inativo</StatusPill> : null}{p.overdue_loans > 0 ? <StatusPill tone="red">{p.overdue_loans} vencido(s)</StatusPill> : null}</p>
                  <p className="flex flex-wrap items-center gap-x-3 text-[12px] text-zinc-500">
                    {p.contact ? <span>{p.contact}</span> : null}
                    {p.phone ? <span className="inline-flex items-center gap-1"><Phone className="size-3" /> {p.phone}</span> : null}
                    <span>{p.total_loans} empréstimo(s) · {p.open_loans} em aberto</span>
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-right text-[12px]">
                  <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.06] px-3 py-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-sky-300/80">Nos deve</p>
                    <p className="font-semibold text-sky-200">{formatCurrency(p.to_receive)}</p>
                  </div>
                  <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.06] px-3 py-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-violet-300/80">Devemos</p>
                    <p className="font-semibold text-violet-200">{formatCurrency(p.to_return)}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <IconBtn title="Editar" onClick={() => setEditing(p)}><Pencil className="size-4" /></IconBtn>
                  <IconBtn title={p.active ? "Inativar" : "Reativar"} onClick={() => toggle(p)}><Power className="size-4" /></IconBtn>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="flex items-center gap-1.5 text-[11.5px] text-zinc-600"><Wallet className="size-3.5" /> Valores calculados pelo pendente × valor unitário de cada empréstimo em aberto.</p>
      </div>
    </Modal>
  );
}
