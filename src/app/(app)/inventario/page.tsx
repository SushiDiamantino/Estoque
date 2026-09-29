"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Plus,
  CheckCircle2,
  Clock3,
  PlayCircle,
  Trash2,
  CalendarDays,
  MapPin,
  User,
  Loader2,
  EyeOff,
  Eye,
  Search,
  RotateCcw,
} from "lucide-react";
import {
  StatCard,
  Modal,
  Field,
  inputCls,
  PrimaryButton,
  StatusPill,
  LoadingRows,
  PageBadge,
} from "@/components/ui";
import { PdfButton } from "@/components/PdfButton";
import { pdfList } from "@/lib/pdf/docs";
import { useToast } from "@/components/Toast";
import { useApp } from "@/components/AppContext";
import { api } from "@/lib/api";
import { formatDateBR, formatDateTime, formatQty } from "@/lib/format";

type Count = {
  id: string;
  code: string;
  locationId: string | null;
  locationName: string | null;
  status: "aberto" | "em_contagem" | "concluido";
  responsible: string | null;
  notes: string | null;
  scheduledFor: string | null;
  finishedAt: string | null;
  createdAt: string;
  totalLines: number;
  countedLines: number;
  divergences: number;
};

export default function InventarioPage() {  const { push } = useToast();
  const { org, refreshAlerts } = useApp();
  const [rows, setRows] = useState<Count[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [locs, setLocs] = useState<{ id: string; name: string }[]>([]);
  const [locationId, setLocationId] = useState("");
  const [responsible, setResponsible] = useState("Operador de Estoque");
  const [scheduledFor, setScheduledFor] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [counting, setCounting] = useState<Count | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<{ counts: Count[] }>("/api/inventory");
    if (r.ok) setRows(r.data.counts ?? []);
    else push({ kind: "error", title: "Erro ao carregar inventários", msg: r.error });
    setLoading(false);
  }, [push]);

  useEffect(() => {
    load();
    setScheduledFor(new Date().toLocaleDateString("en-CA"));
    api<{ locations: { id: string; name: string }[] }>("/api/locations?status=active").then((r) => {
      if (r.ok) setLocs((r.data.locations ?? []).map((l) => ({ id: l.id, name: l.name })));
    });
  }, [load]);

  const create = async () => {
    if (saving) return;
    setSaving(true);
    const r = await api("/api/inventory", {
      method: "POST",
      json: { locationId: locationId || null, responsible, notes, scheduledFor },
    });
    setSaving(false);
    if (r.ok) {
      push({ kind: "success", title: "Inventário agendado" });
      setModal(false);
      setLocationId("");
      setNotes("");
      load();
    } else push({ kind: "error", title: "Erro ao agendar", msg: r.error });
  };

  const act = async (c: Count, action: "start" | "cancel") => {
    if (busyId) return;
    setBusyId(c.id);
    const r = await api<{ lines?: number }>(`/api/inventory/${c.id}`, { method: "PATCH", json: { action } });
    setBusyId(null);
    if (r.ok) {
      if (action === "start") {
        push({ kind: "success", title: "Contagem iniciada", msg: `${r.data.lines ?? 0} linha(s) para contar.` });
        setCounting({ ...c, status: "em_contagem" });
      } else push({ kind: "success", title: "Contagem reiniciada" });
      load();
    } else push({ kind: "error", title: "Não foi possível continuar", msg: r.error });
  };

  const del = async (c: Count) => {
    if (!confirm(`Excluir o inventário ${c.code}?${c.status === "concluido" ? " Os ajustes já aplicados serão mantidos." : ""}`)) return;
    const r = await api(`/api/inventory/${c.id}`, { method: "DELETE" });
    if (r.ok) load();
  };

  const open = rows.filter((r) => r.status === "aberto").length;
  const inCount = rows.filter((r) => r.status === "em_contagem").length;
  const done = rows.filter((r) => r.status === "concluido").length;

  const exportPdf = (print: boolean) =>
    pdfList<Count>({
      org: org.name,
      title: "Inventários",
      subtitle: "Contagens cíclicas e gerais, com progresso e divergências.",
      print,
      kpis: [
        { label: "Agendados", value: String(open) },
        { label: "Em contagem", value: String(inCount) },
        { label: "Concluídos", value: String(done) },
      ],
      columns: [
        { header: "Código", value: (r) => r.code },
        { header: "Escopo", value: (r) => r.locationName ?? "Geral" },
        { header: "Responsável", value: (r) => r.responsible ?? "-" },
        { header: "Previsto", value: (r) => (r.scheduledFor ? formatDateBR(r.scheduledFor) : "-") },
        { header: "Contados", align: "right", value: (r) => r.countedLines + "/" + r.totalLines },
        { header: "Divergências", align: "right", value: (r) => r.divergences },
        { header: "Situação", align: "center", value: (r) => (r.status === "aberto" ? "Agendado" : r.status === "em_contagem" ? "Em contagem" : "Concluído") },
      ],
      rows,
      rowTone: (r) => (r.divergences > 0 ? "amber" : null),
      filename: "inventarios",
    });

  return (
    <div className="animate-fade-in">
      <p className="text-[12px] text-zinc-500">
        Gestão <span className="mx-1.5 text-zinc-700">›</span> <span className="text-zinc-300">Inventário</span>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-[28px] font-bold tracking-tight text-white">Inventário</h2>
            <PageBadge>Cíclico e geral</PageBadge>
          </div>
          <p className="mt-1.5 text-[13.5px] text-zinc-400">
            Realize contagens cíclicas e inventários gerais com conciliação automática.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <PdfButton build={exportPdf} disabled={rows.length === 0} />
          <PrimaryButton onClick={() => setModal(true)}>
            <Plus className="size-4" /> Novo inventário
          </PrimaryButton>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Agendados" value={open} hint="Aguardando início da contagem" icon={<Clock3 className="size-4" />} />
        <StatCard label="Em contagem" value={inCount} hint="Saldo esperado já congelado" icon={<PlayCircle className="size-4" />} accent={inCount > 0 ? <span className="size-1.5 rounded-full bg-sky-400" /> : null} />
        <StatCard label="Concluídos" value={done} hint="Ajustes aplicados com auditoria" icon={<CheckCircle2 className="size-4" />} />
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#141417]">
        <div className="px-5 pt-5">
          <h3 className="text-[15px] font-semibold text-white">Contagens</h3>
          <p className="mt-0.5 text-[12.5px] text-zinc-500">
            Ao concluir, as diferenças geram movimentações de “Ajuste de inventário” automaticamente.
          </p>
        </div>
        {loading && rows.length === 0 ? (
          <LoadingRows label="Carregando inventários…" />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="grid size-[68px] place-items-center rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#232329] to-[#1a1a1f] text-zinc-300">
              <ClipboardList className="size-7" />
            </div>
            <h3 className="mt-5 text-[16px] font-semibold text-white">Comece pelo cíclico</h3>
            <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-zinc-500">
              Agende a primeira contagem por local. Conte, compare com o sistema e ajuste o saldo em um clique.
            </p>
            <div className="mt-5">
              <PrimaryButton onClick={() => setModal(true)}>
                <Plus className="size-4" /> Agendar contagem
              </PrimaryButton>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => {
              const pct = r.totalLines > 0 ? Math.round((r.countedLines / r.totalLines) * 100) : 0;
              return (
                <div key={r.id} className="card-hover flex flex-col rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[12.5px] font-bold text-white">{r.code}</p>
                    {r.status === "aberto" ? (
                      <StatusPill tone="yellow">Agendado</StatusPill>
                    ) : r.status === "em_contagem" ? (
                      <StatusPill tone="blue">Em contagem</StatusPill>
                    ) : (
                      <StatusPill tone="green">Concluído</StatusPill>
                    )}
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-zinc-200">
                    <MapPin className="size-3.5 text-zinc-500" />
                    {r.locationName ?? "Inventário geral (todos os locais)"}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-zinc-500">
                    <User className="size-3.5" /> {r.responsible ?? "—"}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-zinc-500">
                    <CalendarDays className="size-3.5" />
                    {r.scheduledFor ? `Previsto ${formatDateBR(r.scheduledFor)}` : "Sem data"}
                    {r.finishedAt ? ` · concluído ${formatDateTime(r.finishedAt)}` : ""}
                  </p>
                  {r.status !== "aberto" && r.totalLines > 0 ? (
                    <div className="mt-3">
                      <div className="flex justify-between text-[11.5px] text-zinc-500">
                        <span>{r.countedLines}/{r.totalLines} contados</span>
                        <span className={r.divergences > 0 ? "text-amber-300" : ""}>{r.divergences} divergência(s)</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-sky-400" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  ) : null}
                  {r.notes ? (
                    <p className="mt-2.5 rounded-lg border border-white/[0.06] bg-black/20 p-2.5 text-[12.5px] text-zinc-400">{r.notes}</p>
                  ) : null}
                  <div className="flex-1" />
                  <div className="mt-3 flex gap-2 border-t border-white/[0.06] pt-3">
                    {r.status === "aberto" ? (
                      <button
                        onClick={() => act(r, "start")}
                        disabled={busyId === r.id}
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-[12.5px] font-semibold text-sky-300 transition hover:bg-sky-500/15 disabled:opacity-50"
                      >
                        {busyId === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
                        Iniciar contagem
                      </button>
                    ) : null}
                    {r.status === "em_contagem" ? (
                      <>
                        <button
                          onClick={() => setCounting(r)}
                          className="flex-1 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[12.5px] font-semibold text-emerald-300 transition hover:bg-emerald-500/15"
                        >
                          Continuar contagem
                        </button>
                        <button
                          onClick={() => act(r, "cancel")}
                          title="Reiniciar (descarta a contagem)"
                          className="grid size-[34px] place-items-center rounded-lg border border-white/[0.08] text-zinc-500 hover:text-amber-300"
                        >
                          <RotateCcw className="size-4" />
                        </button>
                      </>
                    ) : null}
                    {r.status === "concluido" ? (
                      <button
                        onClick={() => setCounting(r)}
                        className="flex-1 rounded-lg border border-white/[0.08] px-3 py-2 text-[12.5px] font-medium text-zinc-300 transition hover:text-white"
                      >
                        Ver resultado
                      </button>
                    ) : null}
                    <button
                      onClick={() => del(r)}
                      className="grid size-[34px] place-items-center rounded-lg border border-white/[0.08] text-zinc-500 hover:text-red-400"
                      title="Excluir"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Novo inventário" subtitle="Agende uma contagem cíclica ou geral">
        <div className="space-y-4">
          <Field label="Escopo da contagem" hint="Por local: todos os itens ativos. Geral: tudo que tem saldo registrado.">
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls}>
              <option value="" className="bg-zinc-900">Inventário geral — todos os locais</option>
              {locs.map((l) => (
                <option key={l.id} value={l.id} className="bg-zinc-900">{l.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Responsável">
              <input value={responsible} onChange={(e) => setResponsible(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Data prevista">
              <input type="date" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="Observações">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Ex.: contar pescados e congelados primeiro" className={`${inputCls} resize-none`} />
          </Field>
          <div className="flex justify-end gap-2.5">
            <button onClick={() => setModal(false)} className="rounded-lg border border-white/10 px-4 py-2.5 text-[13px] font-medium text-zinc-300 hover:text-white">Cancelar</button>
            <PrimaryButton onClick={create} disabled={saving}>{saving ? "Agendando…" : "Agendar inventário"}</PrimaryButton>
          </div>
        </div>
      </Modal>

      <CountingModal count={counting} onClose={() => setCounting(null)} onChanged={() => { load(); refreshAlerts(); }} />
    </div>
  );
}

type Line = {
  id: string;
  itemId: string;
  itemName: string;
  itemSku: string;
  itemUnit: string;
  locationName: string;
  expectedQty: string;
  countedQty: string | null;
};

function CountingModal({
  count,
  onClose,
  onChanged,
}: {
  count: Count | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { push } = useToast();
  const [lines, setLines] = useState<Line[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "conclude">(null);
  const [blind, setBlind] = useState(false);
  const [q, setQ] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);

  const readOnly = count?.status === "concluido";

  useEffect(() => {
    setLines([]);
    setValues({});
    setDirty(false);
    setQ("");
    setOnlyPending(false);
    if (!count) return;
    let alive = true;
    setLoading(true);
    api<{ lines: Line[] }>(`/api/inventory/${count.id}`).then((r) => {
      if (!alive) return;
      setLoading(false);
      if (!r.ok) {
        push({ kind: "error", title: "Erro ao carregar contagem", msg: r.error });
        return;
      }
      const ls = r.data.lines ?? [];
      setLines(ls);
      const v: Record<string, string> = {};
      for (const l of ls) v[l.id] = l.countedQty === null ? "" : String(Number(l.countedQty));
      setValues(v);
    });
    return () => {
      alive = false;
    };
  }, [count, push]);

  const filtered = useMemo(() => {
    const qn = q.trim().toLowerCase();
    return lines.filter((l) => {
      if (onlyPending && values[l.id] !== "") return false;
      if (!qn) return true;
      return l.itemName.toLowerCase().includes(qn) || l.itemSku.toLowerCase().includes(qn);
    });
  }, [lines, q, onlyPending, values]);

  const countedN = lines.filter((l) => values[l.id] !== "" && values[l.id] !== undefined).length;
  const divergent = lines.filter((l) => values[l.id] !== "" && values[l.id] !== undefined && Number(values[l.id]) !== Number(l.expectedQty));

  if (!count) return null;

  const persist = async (): Promise<boolean> => {
    const payload = lines.map((l) => ({ id: l.id, countedQty: values[l.id] === "" ? null : values[l.id] }));
    const r = await api(`/api/inventory/${count.id}`, { method: "PATCH", json: { action: "save", lines: payload } });
    if (!r.ok) {
      push({ kind: "error", title: "Erro ao salvar contagem", msg: r.error });
      return false;
    }
    setDirty(false);
    return true;
  };

  const save = async () => {
    if (busy) return;
    setBusy("save");
    const ok = await persist();
    setBusy(null);
    if (ok) {
      push({ kind: "success", title: "Contagem salva", msg: `${countedN} de ${lines.length} itens contados.` });
      onChanged();
    }
  };

  const conclude = async () => {
    if (busy) return;
    if (countedN === 0) {
      push({ kind: "error", title: "Conte ao menos um item antes de concluir" });
      return;
    }
    const pending = lines.length - countedN;
    if (!confirm(`Concluir ${count.code}?\n\n${divergent.length} divergência(s) serão ajustadas no saldo.${pending > 0 ? `\n${pending} item(ns) não contados serão ignorados.` : ""}`)) return;
    setBusy("conclude");
    const ok = await persist();
    if (!ok) {
      setBusy(null);
      return;
    }
    const r = await api<{ adjusted: number; movements: string[] }>(`/api/inventory/${count.id}`, { method: "PATCH", json: { action: "conclude" } });
    setBusy(null);
    if (r.ok) {
      push({
        kind: "success",
        title: "Inventário concluído",
        msg: r.data.adjusted > 0 ? `${r.data.adjusted} ajuste(s) · ${r.data.movements.join(", ")}` : "Nenhuma divergência — saldo conferido.",
      });
      onChanged();
      onClose();
    } else push({ kind: "error", title: "Não foi possível concluir", msg: r.error });
  };

  const close = () => {
    if (dirty && !readOnly && !confirm("Há contagens não salvas. Sair mesmo assim?")) return;
    onClose();
  };

  return (
    <Modal open onClose={busy ? () => {} : close} wide title={`${count.code} · ${readOnly ? "Resultado" : "Contagem"}`} subtitle={count.locationName ?? "Inventário geral"}>
      {loading ? (
        <LoadingRows label="Carregando itens da contagem…" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-[13px]">
            <div className="rounded-xl border border-white/[0.07] p-3">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Itens</p>
              <p className="mt-1 text-[18px] font-semibold text-white">{lines.length}</p>
            </div>
            <div className="rounded-xl border border-white/[0.07] p-3">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Contados</p>
              <p className="mt-1 text-[18px] font-semibold text-sky-300">{countedN}</p>
            </div>
            <div className="rounded-xl border border-white/[0.07] p-3">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Divergências</p>
              <p className={`mt-1 text-[18px] font-semibold ${divergent.length ? "text-amber-300" : "text-emerald-300"}`}>{divergent.length}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar por nome ou SKU…" className={`${inputCls} pl-9`} />
            </div>
            {!readOnly ? (
              <div className="flex gap-2">
                <button onClick={() => setOnlyPending((v) => !v)} className={`rounded-lg border px-3 py-2.5 text-[12.5px] font-medium transition ${onlyPending ? "border-sky-500/30 bg-sky-500/10 text-sky-300" : "border-white/10 text-zinc-400 hover:text-white"}`}>
                  Só pendentes
                </button>
                <button onClick={() => setBlind((v) => !v)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-[12.5px] font-medium transition ${blind ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-white/10 text-zinc-400 hover:text-white"}`} title="Contagem cega: esconde o saldo esperado">
                  {blind ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} Cega
                </button>
              </div>
            ) : null}
          </div>

          <div className="max-h-[48vh] overflow-auto rounded-xl border border-white/[0.07]">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead className="sticky top-0 z-10 bg-[#18181c]">
                <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2.5">Item</th>
                  {!count.locationId ? <th className="px-4 py-2.5">Local</th> : null}
                  <th className="px-4 py-2.5 text-right">Sistema</th>
                  <th className="px-4 py-2.5 text-right">Contado</th>
                  <th className="px-4 py-2.5 text-right">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[12.5px] text-zinc-500">Nenhum item para exibir.</td>
                  </tr>
                ) : (
                  filtered.map((l) => {
                    const v = values[l.id] ?? "";
                    const diff = v === "" ? null : Number(v) - Number(l.expectedQty);
                    return (
                      <tr key={l.id} className={diff !== null && Math.abs(diff) > 1e-9 ? "bg-amber-500/[0.04]" : ""}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-white">{l.itemName}</p>
                          <p className="font-mono text-[11px] text-zinc-500">{l.itemSku} · {l.itemUnit}</p>
                        </td>
                        {!count.locationId ? <td className="px-4 py-2.5 text-[12.5px] text-zinc-400">{l.locationName}</td> : null}
                        <td className="px-4 py-2.5 text-right text-zinc-300">{blind && !readOnly ? "•••" : formatQty(l.expectedQty)}</td>
                        <td className="px-4 py-2.5 text-right">
                          {readOnly ? (
                            <span className="text-zinc-200">{v === "" ? "—" : formatQty(v)}</span>
                          ) : (
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.001"
                              value={v}
                              onChange={(e) => {
                                setValues((p) => ({ ...p, [l.id]: e.target.value }));
                                setDirty(true);
                              }}
                              className="w-24 rounded-lg border border-white/[0.1] bg-[#0e0e10] px-2.5 py-1.5 text-right text-[13px] text-white outline-none focus:border-white/30"
                              placeholder="—"
                            />
                          )}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${diff === null || blind && !readOnly ? "text-zinc-600" : Math.abs(diff) < 1e-9 ? "text-emerald-300" : diff > 0 ? "text-sky-300" : "text-red-300"}`}>
                          {diff === null ? "—" : blind && !readOnly ? "•••" : `${diff > 0 ? "+" : ""}${formatQty(diff)}`}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!readOnly ? (
            <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] text-zinc-500">
                {dirty ? "Alterações não salvas." : "Tudo salvo."} Itens em branco não serão ajustados.
              </p>
              <div className="flex gap-2.5">
                <button onClick={save} disabled={!!busy} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-[13px] font-medium text-zinc-200 hover:text-white disabled:opacity-50">
                  {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : null}
                  Salvar contagem
                </button>
                <PrimaryButton onClick={conclude} disabled={!!busy}>
                  {busy === "conclude" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  Concluir e ajustar saldo
                </PrimaryButton>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
