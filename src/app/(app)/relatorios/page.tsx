"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  CalendarRange,
  ClipboardCheck,
  Download,
  FileText,
  Filter,
  Handshake,
  LayoutDashboard,
  Loader2,
  PackageX,
  Printer,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { Field, inputCls, Modal, PageBadge, PrimaryButton, Select } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ReportThemeProvider } from "@/components/reports/kit";
import { SECTION_COMPONENTS } from "@/components/reports/sections";
import { fmtDay, presetRange, PRESETS, todayLocal, type PresetId } from "@/lib/reports/dates";
import { BUCKET_NAME } from "@/lib/reports/fmt";
import { SECTIONS, type Granularity, type ReportData, type SectionId } from "@/lib/reports/types";

const SECTION_ICONS: Record<SectionId, LucideIcon> = {
  overview: LayoutDashboard,
  consumo: Activity,
  estoque: Boxes,
  compras: ShoppingCart,
  perdas: PackageX,
  movimentacao: ArrowLeftRight,
  inventario: ClipboardCheck,
  emprestimos: Handshake,
  projecoes: TrendingUp,
  extrato: FileText,
};

const DEFAULT_TARGET = "15";
const DEFAULT_HORIZON = "30";

export default function RelatoriosPage() {
  const { push } = useToast();
  const [preset, setPreset] = useState<PresetId>("30d");
  const [range, setRange] = useState(() => presetRange("30d"));
  const [location, setLocation] = useState("all");
  const [category, setCategory] = useState("all");
  const [granularity, setGranularity] = useState<Granularity>("auto");
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [horizon, setHorizon] = useState(DEFAULT_HORIZON);
  const [tab, setTab] = useState<SectionId>("overview");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState<null | "print" | "pdf">(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const reqId = useRef(0);

  const query = useMemo(() => {
    const q = new URLSearchParams({ from: range.from, to: range.to, granularity, target: target || DEFAULT_TARGET, horizon });
    if (location !== "all") q.set("location", location);
    if (category !== "all") q.set("category", category);
    return q.toString();
  }, [range, granularity, target, horizon, location, category]);

  const load = useCallback(async () => {
    const my = ++reqId.current;
    setLoading(true);
    const r = await api<ReportData>(`/api/reports?${query}`);
    if (my !== reqId.current) return;
    if (r.ok) setData(r.data);
    else push({ kind: "error", title: "Não foi possível gerar o relatório", msg: r.error });
    setLoading(false);
  }, [query, push]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const choosePreset = (id: string) => {
    const pid = id as PresetId;
    setPreset(pid);
    if (pid !== "custom") setRange(presetRange(pid));
  };
  const setDate = (k: "from" | "to", v: string) => {
    if (!v) return;
    setPreset("custom");
    setRange((r) => {
      const next = { ...r, [k]: v };
      return next.from > next.to ? { from: next.to, to: next.from } : next;
    });
  };
  const hasCustom = location !== "all" || category !== "all" || granularity !== "auto" || target !== DEFAULT_TARGET || horizon !== DEFAULT_HORIZON || preset !== "30d";
  const reset = () => {
    setPreset("30d");
    setRange(presetRange("30d"));
    setLocation("all");
    setCategory("all");
    setGranularity("auto");
    setTarget(DEFAULT_TARGET);
    setHorizon(DEFAULT_HORIZON);
  };

  const Section = SECTION_COMPONENTS[tab];
  const opts = data?.options ?? { locations: [], categories: [] };
  const f = data?.filters;

  return (
    <div className="animate-fade-in">
      <p className="text-[12px] text-zinc-500">
        Gestão <span className="mx-1.5 text-zinc-700">›</span> <span className="text-zinc-300">Relatórios</span>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-[28px] font-bold tracking-tight text-white">Relatórios</h2>
            <PageBadge>Gerencial</PageBadge>
          </div>
          <p className="mt-1.5 text-[13.5px] text-zinc-400">
            Indicadores, gráficos, comparativos, projeções e sugestões de compra — com impressão e PDF de verdade.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[13px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white">
            <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Atualizar
          </button>
          <button onClick={() => setExportOpen("print")} disabled={!data} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[13px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white disabled:opacity-50">
            <Printer className="size-4" /> Imprimir
          </button>
          <PrimaryButton onClick={() => setExportOpen("pdf")} disabled={!data}>
            <Download className="size-4" /> Baixar PDF
          </PrimaryButton>
        </div>
      </div>

      {/* Filtros */}
      <div className="mt-6 rounded-xl border border-white/[0.07] bg-[#141417]">
        <button onClick={() => setFiltersOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
          <span className="flex items-center gap-2 text-[14px] font-semibold text-white">
            <Filter className="size-4 text-zinc-500" /> Filtros
            {f ? (
              <span className="ml-2 hidden text-[12.5px] font-normal text-zinc-500 sm:inline">
                {fmtDay(f.from)} – {fmtDay(f.to)} · {f.days} dia(s) · {f.locationName ?? "todos os locais"} · {f.categoryName ?? "todas as categorias"}
              </span>
            ) : null}
          </span>
          <span className="text-[12px] text-zinc-500">{filtersOpen ? "Recolher" : "Expandir"}</span>
        </button>
        {filtersOpen ? (
          <div className="border-t border-white/[0.06] px-5 pb-5 pt-4">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.filter((p) => p.id !== "custom").map((p) => (
                <button
                  key={p.id}
                  onClick={() => choosePreset(p.id)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition",
                    preset === p.id ? "border-white/30 bg-white/10 text-white" : "border-white/[0.08] text-zinc-400 hover:border-white/20 hover:text-white"
                  )}
                >
                  {p.label}
                </button>
              ))}
              {preset === "custom" ? <span className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-[12.5px] font-medium text-sky-300">Personalizado</span> : null}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="De">
                <input type="date" value={range.from} max={range.to} onChange={(e) => setDate("from", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Até">
                <input type="date" value={range.to} min={range.from} max={todayLocal()} onChange={(e) => setDate("to", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Local">
                <Select value={location} onChange={setLocation} options={[{ value: "all", label: "Todos os locais" }, ...opts.locations.map((l) => ({ value: l.id, label: l.name }))]} />
              </Field>
              <Field label="Categoria">
                <Select value={category} onChange={setCategory} options={[{ value: "all", label: "Todas as categorias" }, ...opts.categories.map((c) => ({ value: c.id, label: c.name }))]} />
              </Field>
              <Field label="Agrupar gráficos por">
                <Select
                  value={granularity}
                  onChange={(v) => setGranularity(v as Granularity)}
                  options={[
                    { value: "auto", label: `Automático${f && granularity === "auto" ? ` (${BUCKET_NAME[f.bucket]})` : ""}` },
                    { value: "day", label: "Dia" },
                    { value: "week", label: "Semana" },
                    { value: "month", label: "Mês" },
                  ]}
                />
              </Field>
              <Field label="Meta de cobertura (dias)" hint="Base da sugestão de compra">
                <input type="number" min={1} max={120} value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Horizonte de projeção">
                <Select value={horizon} onChange={setHorizon} options={["15", "30", "60", "90"].map((v) => ({ value: v, label: `${v} dias` }))} />
              </Field>
              <div className="flex items-end">
                <button onClick={reset} disabled={!hasCustom} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3.5 py-2.5 text-[13px] font-medium text-zinc-400 transition hover:text-white disabled:opacity-40">
                  <X className="size-4" /> Limpar filtros
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Abas */}
      <div className="sticky top-[68px] z-10 -mx-4 mt-4 border-b border-white/[0.06] bg-[#0b0b0d]/90 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex gap-1.5 overflow-x-auto">
          {SECTIONS.map((sct) => {
            const Icon = SECTION_ICONS[sct.id];
            const active = tab === sct.id;
            return (
              <button
                key={sct.id}
                onClick={() => setTab(sct.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium transition",
                  active ? "bg-white text-zinc-950" : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                )}
              >
                <Icon className="size-4" />
                {sct.label}
              </button>
            );
          })}
        </div>
      </div>

      {f ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-zinc-500">
          <span className="inline-flex items-center gap-1.5"><CalendarRange className="size-3.5" /> {fmtDay(f.from)} – {fmtDay(f.to)} ({f.days} dia{f.days === 1 ? "" : "s"})</span>
          <span>comparado com {fmtDay(f.prevFrom)} – {fmtDay(f.prevTo)}</span>
          <span>agrupado por {BUCKET_NAME[f.bucket]}</span>
          <span className="ml-auto">{loading ? <span className="inline-flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" /> atualizando…</span> : `Atualizado às ${new Date(data!.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}</span>
        </div>
      ) : null}

      <div className="mt-4">
        {!data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-[104px] animate-pulse rounded-xl bg-white/[0.04]" />)}
            </div>
            <div className="h-[300px] animate-pulse rounded-xl bg-white/[0.04]" />
          </div>
        ) : (
          <ReportThemeProvider mode="screen">
            <div className={cn("transition-opacity", loading && "opacity-60")}>
              <Section key={tab} d={data} />
            </div>
          </ReportThemeProvider>
        )}
      </div>

      <ExportModal open={exportOpen} data={data} query={query} current={tab} onClose={() => setExportOpen(null)} />
    </div>
  );
}

function ExportModal({ open, data, query, current, onClose }: { open: null | "print" | "pdf"; data: ReportData | null; query: string; current: SectionId; onClose: () => void }) {
  const { push } = useToast();
  const [selected, setSelected] = useState<SectionId[]>(SECTIONS.map((s) => s.id));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setBusy(false);
  }, [open]);

  if (!open || !data) return null;
  const ordered = SECTIONS.map((s) => s.id).filter((id) => selected.includes(id));
  const toggle = (id: SectionId) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const doPrint = () => {
    if (!ordered.length) return push({ kind: "error", title: "Selecione ao menos uma seção" });
    const w = window.open(`/imprimir/relatorio?${query}&s=${ordered.join(",")}&auto=1`, "_blank");
    if (!w) push({ kind: "error", title: "O navegador bloqueou a nova aba", msg: "Permita pop-ups para este site e tente novamente." });
    else onClose();
  };
  const doPdf = async () => {
    if (!ordered.length) return push({ kind: "error", title: "Selecione ao menos uma seção" });
    setBusy(true);
    try {
      const { generateReportPdf } = await import("@/lib/reports/pdf");
      await generateReportPdf(data, ordered);
      push({ kind: "success", title: "PDF gerado", msg: `${ordered.length} seção(ões) · relatorio-estoque_${data.filters.from}_${data.filters.to}.pdf` });
      onClose();
    } catch (e) {
      console.error(e);
      push({ kind: "error", title: "Falha ao gerar o PDF", msg: "Tente novamente ou use a opção Imprimir." });
    } finally {
      setBusy(false);
    }
  };

  const f = data.filters;
  return (
    <Modal open onClose={busy ? () => {} : onClose} wide title={open === "pdf" ? "Baixar relatório em PDF" : "Imprimir relatório"} subtitle="Escolha as seções — o documento é gerado em A4, com capa, sumário, gráficos e tabelas completas">
      <div className="space-y-5">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 text-[12.5px] text-zinc-400">
          <p><strong className="text-zinc-200">{data.restaurantName}</strong> · {fmtDay(f.from)} a {fmtDay(f.to)} ({f.days} dias)</p>
          <p className="mt-1">{f.locationName ?? "Todos os locais"} · {f.categoryName ?? "Todas as categorias"} · agrupado por {BUCKET_NAME[f.bucket]} · meta {f.targetDays} dias · projeção {f.horizon} dias</p>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12.5px] font-semibold text-zinc-300">Seções ({ordered.length}/{SECTIONS.length})</p>
            <div className="flex gap-3 text-[12px]">
              <button onClick={() => setSelected(SECTIONS.map((s) => s.id))} className="text-zinc-400 hover:text-white">Todas</button>
              <button onClick={() => setSelected([current])} className="text-zinc-400 hover:text-white">Só a aba atual</button>
              <button onClick={() => setSelected([])} className="text-zinc-400 hover:text-white">Nenhuma</button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SECTIONS.map((sct) => {
              const Icon = SECTION_ICONS[sct.id];
              const on = selected.includes(sct.id);
              return (
                <button
                  key={sct.id}
                  onClick={() => toggle(sct.id)}
                  className={cn("flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-[13px] transition", on ? "border-white/25 bg-white/[0.06] text-white" : "border-white/[0.07] text-zinc-500 hover:text-zinc-300")}
                >
                  <span className={cn("grid size-5 place-items-center rounded border text-[11px] font-bold", on ? "border-emerald-400 bg-emerald-400 text-zinc-950" : "border-white/20")}>{on ? "✓" : ""}</span>
                  <Icon className="size-4 shrink-0" />
                  {sct.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11.5px] text-zinc-600">Capa com parâmetros, sumário e resumo executivo são incluídos sempre.</p>
        </div>
        <div className="flex flex-col-reverse gap-2.5 border-t border-white/[0.06] pt-4 sm:flex-row sm:justify-end">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-white/10 px-4 py-2.5 text-[13px] font-medium text-zinc-300 hover:text-white disabled:opacity-50">Cancelar</button>
          <button onClick={doPrint} disabled={busy} className={cn("inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition disabled:opacity-50", open === "print" ? "bg-zinc-100 text-zinc-950 hover:bg-white" : "border border-white/10 text-zinc-200 hover:text-white")}>
            <Printer className="size-4" /> Abrir para impressão
          </button>
          <button onClick={doPdf} disabled={busy} className={cn("inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition disabled:opacity-50", open === "pdf" ? "bg-zinc-100 text-zinc-950 hover:bg-white" : "border border-white/10 text-zinc-200 hover:text-white")}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <BarChart3 className="size-4" />} {busy ? "Gerando PDF…" : "Baixar arquivo PDF"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
