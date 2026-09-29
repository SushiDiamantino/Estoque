"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  CalendarDays,
  Gauge,
  ClipboardCheck,
  TrendingUp,
  ShoppingCart,
  Brain,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Info,
  Wallet,
  Banknote,
  Flame,
  Download,
  Eye,
  EyeOff,
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
import { LineChart, Legend, COLORS } from "@/components/charts";
import Link from "next/link";
import { PdfButton } from "@/components/PdfButton";
import { pdfDemandReport, pdfShoppingList } from "@/lib/pdf/docs";
import { useToast } from "@/components/Toast";
import { useApp } from "@/components/AppContext";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatCurrency, formatQty } from "@/lib/format";
import { downloadCsv } from "@/lib/reports/csv";
import type { DemandOverview, DayForecast, ShoppingItem } from "@/lib/demand/engine";

const br = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");
const short = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const mult = (m: number) => `×${m.toFixed(2)}`;
const deltaPct = (m: number) => `${m >= 1 ? "+" : ""}${Math.round((m - 1) * 100)}%`;
const axisMoney = (v: number) =>
  Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k` : `R$ ${Math.round(v)}`;

const LEVEL_META: Record<DayForecast["level"], { label: string; cell: string; text: string; dot: string }> = {
  muito_alta: { label: "Pico", cell: "border-red-500/50 bg-red-500/[0.14] hover:bg-red-500/[0.2]", text: "text-red-300", dot: "bg-red-400" },
  alta: { label: "Alta", cell: "border-amber-500/40 bg-amber-500/[0.1] hover:bg-amber-500/[0.16]", text: "text-amber-300", dot: "bg-amber-400" },
  normal: { label: "Normal", cell: "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05]", text: "text-zinc-300", dot: "bg-zinc-500" },
  baixa: { label: "Fraca", cell: "border-sky-500/25 bg-sky-500/[0.06] hover:bg-sky-500/[0.1]", text: "text-sky-300", dot: "bg-sky-400" },
  muito_baixa: { label: "Muito fraca", cell: "border-white/[0.05] bg-transparent hover:bg-white/[0.03]", text: "text-zinc-500", dot: "bg-zinc-600" },
};

const MONTH_FULL = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

type EventRow = {
  id: string;
  title: string;
  kind: string;
  systemKey: string | null;
  date: string | null;
  month: number | null;
  day: number | null;
  multiplier: string;
  windowBefore: number;
  windowAfter: number;
  active: boolean;
  notes: string | null;
};

export default function DemandaPage() {
  const { push } = useToast();
  const { org, refreshAlerts } = useApp();
  const [data, setData] = useState<DemandOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState("45");
  const [target, setTarget] = useState("auto");
  const [daySel, setDaySel] = useState<string | null>(null);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [eventsDraft, setEventsDraft] = useState<{ systemKey: string; title: string; multiplier: number } | null>(null);
  const [shopTab, setShopTab] = useState("all");
  const [shopQ, setShopQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = target === "auto" ? `horizon=${horizon}` : `horizon=${horizon}&target=${target}`;
    const r = await api<DemandOverview>(`/api/demand/overview?${qs}`);
    if (r.ok) setData(r.data);
    else push({ kind: "error", title: "Não foi possível carregar a central", msg: r.error });
    setLoading(false);
  }, [horizon, target, push]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const months = useMemo(() => {
    if (!data) return [];
    const groups = new Map<string, DayForecast[]>();
    for (const d of data.calendar) {
      const key = d.date.slice(0, 7);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }
    return [...groups.entries()].map(([key, days]) => {
      const [y, m] = key.split("-").map(Number);
      const firstDow = new Date(y, m - 1, 1).getDay();
      const blanks = (firstDow + 6) % 7; // semana começa na segunda
      return { key, label: `${MONTH_FULL[m - 1]} de ${y}`, days, blanks };
    });
  }, [data]);

  const shopFiltered = useMemo(() => {
    if (!data) return [];
    const q = shopQ.trim().toLowerCase();
    return data.shopping.filter((s) => {
      if (shopTab === "critical" && s.urgency !== "critical") return false;
      if (shopTab === "high" && s.urgency === "normal") return false;
      if (q && !`${s.name} ${s.sku} ${s.category ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, shopTab, shopQ]);

  const exportShopping = () => {
    if (!data) return;
    downloadCsv(
      `lista-de-compras-demanda_${data.today}`,
      ["item", "sku", "categoria", "unidade", "estoque", "minimo", "saida_media_dia", "cobertura_dias", "ruptura_prevista", "pedir_ate", "sugerido", "valor_estimado", "urgencia", "motivos"],
      data.shopping.map((s) => [
        s.name, s.sku, s.category ?? "", s.unit, s.stock, s.min,
        Math.round(s.avgDaily * 1000) / 1000,
        s.coverageDays === null ? "" : Math.floor(s.coverageDays),
        s.ruptureDate ?? "", s.orderBy ?? "", s.suggestion, Math.round(s.suggestionValue * 100) / 100,
        s.urgency === "critical" ? "critica" : s.urgency === "high" ? "alta" : "normal",
        s.reasons.join(" | "),
      ])
    );
    push({ kind: "success", title: "CSV exportado", msg: `${data.shopping.length} item(ns) na lista.` });
  };

  const selDay = data?.calendar.find((c) => c.date === daySel) ?? null;
  const L = data?.learning;

  return (
    <div className="animate-fade-in">
      <p className="text-[12px] text-zinc-500">
        Inteligência <span className="mx-1.5 text-zinc-700">›</span> <span className="text-zinc-300">Central de Demanda</span>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="flex items-center gap-2.5 text-[28px] font-bold tracking-tight text-white">
              <Sparkles className="size-7 text-amber-300" /> Central de Demanda
            </h2>
            <PageBadge>Previsão · calendário · compras</PageBadge>
          </div>
          <p className="mt-1.5 max-w-2xl text-[13.5px] text-zinc-400">
            Feriados, datas comemorativas, pagamentos e o ritmo da sua casa combinados em uma previsão por dia —
            que fica mais precisa a cada lançamento.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Select value={horizon} onChange={setHorizon} className="w-[150px]" options={[{ value: "30", label: "30 dias" }, { value: "45", label: "45 dias" }, { value: "60", label: "60 dias" }, { value: "90", label: "90 dias" }]} />
          <Select
            value={target}
            onChange={setTarget}
            className="w-[210px]"
            options={[
              { value: "auto", label: data ? "Cobertura: ciclo (" + data.purchase.coverDays + "d)" : "Cobertura: automática" },
              { value: "7", label: "Cobertura: 7 dias" },
              { value: "10", label: "Cobertura: 10 dias" },
              { value: "14", label: "Cobertura: 14 dias" },
              { value: "21", label: "Cobertura: 21 dias" },
              { value: "30", label: "Cobertura: 30 dias" },
            ]}
          />
          <button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[13px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white">
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
          <button onClick={() => { setEventsDraft(null); setEventsOpen(true); }} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[13px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white">
            <CalendarDays className="size-4" /> Eventos
          </button>
          {data ? <PdfButton label="PDF da central" build={(print) => pdfDemandReport({ org: org.name, data, print })} /> : null}
        </div>
      </div>

      {loading && !data ? (
        <div className="mt-6 space-y-4">
          <div className="h-[120px] animate-pulse rounded-xl bg-white/[0.04]" />
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-[104px] animate-pulse rounded-xl bg-white/[0.04]" />)}</div>
          <div className="h-[320px] animate-pulse rounded-xl bg-white/[0.04]" />
        </div>
      ) : !data ? (
        <div className="mt-6 rounded-xl border border-white/[0.07] bg-[#141417] p-10 text-center text-[13.5px] text-zinc-500">
          Não foi possível carregar. Tente atualizar.
        </div>
      ) : (
        <div className={loading ? "opacity-60 transition" : "transition"}>
          {/* Aprendizado */}
          <div className="mt-6 rounded-xl border border-white/[0.07] bg-[#141417] p-5">
            <div className="flex flex-wrap items-center gap-4">
              <span className="grid size-11 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-amber-300">
                <Brain className="size-5" />
              </span>
              <div className="min-w-[200px] flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <p className="text-[14.5px] font-semibold text-white">Aprendizado: {L?.levelLabel}</p>
                  <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11.5px] font-bold text-zinc-200">{L?.score}/100</span>
                  {!data.hasHistory ? <StatusPill tone="yellow">Calibragem</StatusPill> : <StatusPill tone="green">Ativo</StatusPill>}
                </div>
                <div className="mt-2 h-2 max-w-md overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all" style={{ width: `${L?.score ?? 0}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[12.5px] sm:grid-cols-3">
                <span className="text-zinc-500">Histórico <strong className="text-zinc-200">{L?.observedDays} dias</strong>{L?.firstDate ? ` desde ${br(L.firstDate)}` : ""}</span>
                <span className="text-zinc-500">Cobertura <strong className="text-zinc-200">{Math.round((L?.coverage ?? 0) * 100)}%</strong> dos dias com lançamento</span>
                <span className="text-zinc-500">Ciclos de folha <strong className="text-zinc-200">{L?.paydayCycles}</strong> · eventos observados <strong className="text-zinc-200">{L?.eventsObserved}</strong></span>
              </div>
            </div>
            {(L?.missingDays.length ?? 0) >= 3 ? (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 text-[12.5px] text-amber-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {L?.missingDays.length} dias recentes sem baixa de consumo ({L?.missingDays.slice(0, 5).map((d) => d.slice(8, 10) + "/" + d.slice(5, 7)).join(", ")}).
                A casa abre todo dia — lançar as saídas diariamente é o que alimenta a previsão.
              </p>
            ) : null}
          </div>

          {/* Medição do consumo e ciclo de compras */}
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-white/[0.07] bg-[#141417] p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500"><Gauge className="size-3.5" /> Medição do consumo</p>
              <p className="mt-1.5 text-[15px] font-semibold text-white">{data.consumption.modeLabel}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                {data.consumption.recordingDays} lançamento(s) a cada ~{data.consumption.avgPeriodDays.toFixed(1)} dias.{" "}
                {data.consumption.spreadApplied
                  ? "Cada baixa é distribuída pelos dias do período, com peso maior em sexta e sábado."
                  : "Lançamentos diários usados diretamente."}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-[#141417] p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500"><ClipboardCheck className="size-3.5" /> Ancoragem no inventário</p>
              <p className={cn("mt-1.5 text-[15px] font-semibold", data.consumption.anchorFactor > 1.02 ? "text-amber-300" : "text-white")}>
                {data.consumption.anchorCounts === 0
                  ? "Aguardando contagem"
                  : data.consumption.anchorFactor > 1.02
                    ? "+" + Math.round((data.consumption.anchorFactor - 1) * 100) + "% de consumo real"
                    : "Conferido"}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                {data.consumption.anchorCounts === 0
                  ? "Faça o inventário completo: a partir dele o sistema compara consumo lançado × real e corrige sozinho."
                  : data.consumption.anchorCounts + " contagem(ns) · " + formatCurrency(data.consumption.missingValue) + " a menos que o sistema · " + data.consumption.itemsAdjusted + " item(ns) corrigidos."}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-[#141417] p-4">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500"><ShoppingCart className="size-3.5" /> Ciclo de compras</p>
              <p className="mt-1.5 text-[15px] font-semibold text-white">
                {data.purchase.nextDate ? short(data.purchase.nextDate) + " · " + data.purchase.dayNames.join(", ") : "—"}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                {data.purchase.source === "configurado" ? "Configurado" : data.purchase.source === "historico" ? "Identificado pelo histórico" : "Padrão"} ·
                pedido cobre {data.purchase.coverDays} dias
                {data.purchase.emergencyRate > 0 ? " · " + Math.round(data.purchase.emergencyRate * 100) + "% emergenciais" : ""}
              </p>
            </div>
          </div>

          {/* KPIs */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Demanda · próximos 7 dias" value={deltaPct(data.summary.avgIndex7)} hint={data.hasHistory ? `Projetado: ${formatCurrency(data.summary.projectedValue * 7 / data.horizon)}` : "Estimativa do segmento (sem histórico)"} icon={<TrendingUp className="size-4" />} accent={data.summary.avgIndex7 >= 1.2 ? <span className="size-1.5 rounded-full bg-amber-400" /> : null} />
            <StatCard
              label="Próximo pico"
              value={data.summary.nextPeak ? short(data.summary.nextPeak.date) : "—"}
              hint={data.summary.nextPeak ? `${data.summary.nextPeak.title} · ${deltaPct(data.summary.nextPeak.mult)}${data.summary.nextPeak.daysLeft === 0 ? " · hoje" : ` · em ${data.summary.nextPeak.daysLeft}d`}` : "Nenhum pico no horizonte"}
              icon={<Flame className="size-4" />}
              accent={data.summary.nextPeak ? <span className="size-1.5 rounded-full bg-red-500" /> : null}
            />
            <StatCard label="Itens em risco" value={data.criticalCount} hint={data.criticalCount > 0 ? "Zeram antes do pico ou do prazo" : "Cobertura tranquila"} icon={<AlertTriangle className="size-4" />} accent={data.criticalCount > 0 ? <span className="size-1.5 rounded-full bg-red-500" /> : null} />
            <StatCard label="Compra sugerida" value={formatCurrency(data.shoppingTotal)} hint={`${data.shopping.filter((s) => s.suggestion > 0).length} item(ns) · meta ${data.targetDays}d + lead time`} icon={<ShoppingCart className="size-4" />} />
          </div>

          {/* Calendário */}
          <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#141417] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-[15px] font-semibold text-white"><CalendarDays className="size-4 text-zinc-400" /> Calendário de demanda</h3>
                <p className="mt-0.5 text-[12.5px] text-zinc-500">Índice por dia (1,00 = dia normal) · clique em um dia para ver o porquê da previsão</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-zinc-500">
                {(Object.keys(LEVEL_META) as (keyof typeof LEVEL_META)[]).map((k) => (
                  <span key={k} className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${LEVEL_META[k].dot}`} />{LEVEL_META[k].label}</span>
                ))}
                <span className="flex items-center gap-1.5"><Banknote className="size-3.5 text-emerald-400" />pagamento</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-sky-400" />vale</span>
              </div>
            </div>
            <div className="mt-4 space-y-6">
              {months.map((m) => (
                <div key={m.key}>
                  <p className="mb-2 text-[12.5px] font-semibold capitalize text-zinc-300">{m.label}</p>
                  <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wide text-zinc-600">
                    {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((w) => <span key={w}>{w}</span>)}
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {Array.from({ length: m.blanks }).map((_, i) => <span key={`b${i}`} />)}
                    {m.days.map((d) => {
                      const meta = LEVEL_META[d.level];
                      const isToday = d.date === data.today;
                      const sel = d.date === daySel;
                      return (
                        <button
                          key={d.date}
                          onClick={() => setDaySel(d.date)}
                          className={`min-w-0 rounded-lg border p-1.5 text-left transition sm:p-2 ${meta.cell} ${isToday ? "ring-1 ring-white" : ""} ${sel ? "ring-2 ring-amber-300" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className={`text-[13px] font-bold tabular-nums ${meta.text}`}>{d.date.slice(8, 10)}</span>
                            <span className={`rounded px-1 text-[10px] font-bold tabular-nums ${meta.text}`}>×{d.index.toFixed(2)}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-1">
                            {d.isPayday ? <Banknote className="size-3 shrink-0 text-emerald-400" /> : null}
                            {d.isAdvance ? <span className="size-2 shrink-0 rounded-full bg-sky-400" title="Vale" /> : null}
                            {d.events.length > 0 ? <span className="size-2 shrink-0 rounded-full bg-red-400" title={d.events.map((e) => e.title).join(", ")} /> : null}
                            {d.ruptures > 0 ? <span className="rounded bg-red-500/20 px-1 text-[9px] font-bold text-red-300">{d.ruptures} zeram</span> : null}
                          </div>
                          <p className="mt-0.5 truncate text-[10px] text-zinc-500">{d.events[0]?.title ?? (d.isPayday ? "Salário" : d.isAdvance ? "Vale" : "")}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Projeção */}
          <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#141417] p-5">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-white"><TrendingUp className="size-4 text-zinc-400" /> Projeção de consumo em valor</h3>
            <p className="mt-0.5 text-[12.5px] text-zinc-500">
              {data.hasHistory ? `Faixa de confiança de ~80% · tendência ${data.factors.trendPctMonth === null ? "—" : `${data.factors.trendPctMonth > 0 ? "+" : ""}${data.factors.trendPctMonth.toFixed(1)}%/mês`}` : "A curva em valor aparece após os primeiros lançamentos — o calendário acima já usa os pesos do segmento"}
            </p>
            {data.hasHistory ? (
              <div className="mt-3">
                <LineChart
                  data={data.calendar.map((c) => ({ label: short(c.date), value: Math.round(c.value), low: Math.round(c.low), high: Math.round(c.high) }))}
                  series={[{ key: "value", label: "Projeção", color: COLORS.consumption, width: 2.4 }]}
                  band={{ low: "low", high: "high", color: COLORS.consumption, label: "Faixa provável" }}
                  format={axisMoney}
                  height={220}
                />
                <Legend items={[{ label: "Projeção diária", color: COLORS.consumption }, { label: "Faixa provável (80%)", color: `${COLORS.consumption}55` }]} />
              </div>
            ) : (
              <EmptyState icon={<TrendingUp className="size-7" />} title="Curva em calibragem" description="Registre entradas e saídas por alguns dias e a projeção em reais aparece aqui — com tendência e intervalo de confiança." />
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {/* Picos */}
            <div className="rounded-xl border border-white/[0.07] bg-[#141417] p-5">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold text-white"><Flame className="size-4 text-zinc-400" /> Próximos picos</h3>
              <p className="mt-0.5 text-[12.5px] text-zinc-500">Dias com demanda a partir de 30% acima do normal</p>
              {data.peaks.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-zinc-500">Nenhum pico no horizonte selecionado.</p>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {data.peaks.map((p) => (
                    <button key={p.date} onClick={() => setDaySel(p.date)} className="flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5 text-left transition hover:border-white/[0.15]">
                      <span className={`grid size-11 shrink-0 place-items-center rounded-lg border text-[13px] font-bold ${p.mult >= 1.6 ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
                        +{Math.round((p.mult - 1) * 100)}%
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-white">{p.title}</span>
                        <span className="block text-[12px] text-zinc-500">
                          {p.label} · {p.daysLeft === 0 ? "hoje" : p.daysLeft === 1 ? "amanhã" : `em ${p.daysLeft} dias`}
                          {p.ruptures > 0 ? ` · ${p.ruptures} item(ns) zeram até lá` : ""}
                        </span>
                      </span>
                      {p.purchaseValue > 0 ? <span className="shrink-0 text-[12px] font-semibold text-zinc-300">{formatCurrency(p.purchaseValue)}</span> : null}
                    </button>
                  ))}
                </div>
              )}
              {/* Folha */}
              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300/80"><Banknote className="size-3.5" /> Próximo salário</p>
                  <p className="mt-1 text-[14px] font-semibold text-white">{data.summary.paydayNext ? br(data.summary.paydayNext.date) : "—"}</p>
                  <p className="text-[11.5px] text-zinc-500">5º dia útil · efeito {deltaPct(data.factors.payday.factor)} por 3 dias{data.factors.payday.samples > 0 ? ` (${data.factors.payday.samples} dias observados)` : " (estimativa)"}</p>
                </div>
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.05] p-3.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sky-300/80"><Wallet className="size-3.5" /> Próximo vale</p>
                  <p className="mt-1 text-[14px] font-semibold text-white">{data.summary.advanceNext ? br(data.summary.advanceNext.date) : "—"}</p>
                  <p className="text-[11.5px] text-zinc-500">efeito {deltaPct(data.factors.advance.factor)} por 2 dias{data.factors.advance.samples > 0 ? ` (${data.factors.advance.samples} dias observados)` : " (estimativa)"}</p>
                </div>
              </div>
            </div>

            {/* Insights */}
            <div className="rounded-xl border border-white/[0.07] bg-[#141417] p-5">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold text-white"><Brain className="size-4 text-zinc-400" /> O que a central percebeu</h3>
              <p className="mt-0.5 text-[12.5px] text-zinc-500">Leitura automática do período</p>
              <div className="mt-3 space-y-2.5">
                {data.insights.map((i, idx) => (
                  <div key={idx} className={`flex items-start gap-3 rounded-xl border p-3.5 ${i.tone === "bad" ? "border-red-500/25 bg-red-500/[0.06]" : i.tone === "warn" ? "border-amber-500/25 bg-amber-500/[0.06]" : i.tone === "good" ? "border-emerald-500/25 bg-emerald-500/[0.06]" : "border-sky-500/25 bg-sky-500/[0.06]"}`}>
                    <span className="mt-0.5 shrink-0">{i.tone === "bad" || i.tone === "warn" ? <AlertTriangle className="size-4 text-amber-300" /> : i.tone === "good" ? <CheckCircle2 className="size-4 text-emerald-300" /> : <Info className="size-4 text-sky-300" />}</span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-white">{i.title}</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-400">{i.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Lista de compras */}
          <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#141417]">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
              <div>
                <h3 className="flex items-center gap-2 text-[15px] font-semibold text-white">
                  <ShoppingCart className="size-4 text-zinc-400" /> Lista de compras sugerida
                  <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-300">{data.shopping.length}</span>
                </h3>
                <p className="mt-0.5 text-[12.5px] text-zinc-500">
                  Cobre lead time + meta de {data.targetDays} dias com margem de segurança · total {formatCurrency(data.shoppingTotal)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={exportShopping} disabled={data.shopping.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[12.5px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white disabled:opacity-40">
                  <Download className="size-4" /> CSV
                </button>
                <PdfButton label="PDF da lista" disabled={data.shopping.length === 0} build={(print) => pdfShoppingList({ org: org.name, data, print })} />
                <Link href="/compras?novo=1" className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-3.5 py-2 text-[12.5px] font-semibold text-zinc-950 transition hover:bg-white">
                  <ShoppingCart className="size-4" /> Gerar pedido
                </Link>
              </div>
            </div>
            <div className="px-5 py-4">
              <SearchInput value={shopQ} onChange={setShopQ} placeholder="Filtrar por item, SKU ou categoria…" />
            </div>
            <Tabs
              active={shopTab}
              onChange={setShopTab}
              tabs={[
                { value: "all", label: "Todos", count: data.shopping.length },
                { value: "critical", label: "Críticos", count: data.shopping.filter((s) => s.urgency === "critical").length },
                { value: "high", label: "Atenção", count: data.shopping.filter((s) => s.urgency !== "normal").length },
              ]}
            />
            <TableShell
              head={<><Th>Item</Th><Th>Estoque / mín.</Th><Th>Ritmo</Th><Th>Comprar</Th><Th>Pedir até</Th><Th>Por quê</Th></>}
              empty={shopFiltered.length === 0}
            >
              {shopFiltered.length === 0 ? (
                <EmptyState icon={<CheckCircle2 className="size-7" />} title="Nada para comprar" description="Estoque cobre o horizonte com a meta atual — ou ajuste os filtros." />
              ) : (
                shopFiltered.map((s) => (
                  <tr key={s.itemId} className="transition hover:bg-white/[0.02]">
                    <Td>
                      <div className="min-w-0 max-w-[240px]">
                        <p className="truncate text-[13.5px] font-semibold text-white">{s.name}</p>
                        <p className="font-mono text-[11px] text-zinc-500">{s.sku}{s.category ? ` · ${s.category}` : ""}</p>
                      </div>
                    </Td>
                    <Td>
                      <span className={`text-[13px] font-semibold ${s.stockEffective < s.min ? "text-red-400" : "text-zinc-100"}`}>{formatQty(s.stockEffective)}</span>
                      <span className="text-[12px] text-zinc-500"> / {formatQty(s.min)} {s.unit}</span>
                      {s.owedOut > 0 ? <p className="text-[11px] text-violet-300">−{formatQty(s.owedOut)} de empréstimo</p> : null}
                      <p className="text-[11px] text-zinc-600">{s.coverageDays === null ? "sem ritmo" : s.coverageDays < 1 ? "menos de 1 dia" : `${Math.floor(s.coverageDays)} dias de cobertura`}</p>
                    </Td>
                    <Td>
                      <span className="text-[12.5px] text-zinc-300">{s.noHistory ? "—" : `${formatQty(Math.round(s.avgDaily * 1000) / 1000)} ${s.unit}/dia`}</span>
                      <p className="text-[11px] text-zinc-600">{s.ruptureDate ? `zera em ${br(s.ruptureDate)}` : s.noHistory ? "sem histórico" : "sem ruptura prevista"}</p>
                    </Td>
                    <Td>
                      {s.suggestion > 0 ? (
                        <><p className="text-[13.5px] font-bold text-white">{formatQty(s.suggestion)} {s.unit}</p><p className="text-[11.5px] text-zinc-500">{formatCurrency(s.suggestionValue)}</p></>
                      ) : <span className="text-[12px] text-zinc-600">—</span>}
                    </Td>
                    <Td>
                      {s.urgency === "critical" ? <StatusPill tone="red">Crítico{s.orderBy ? ` · até ${short(s.orderBy)}` : ""}</StatusPill>
                        : s.urgency === "high" ? <StatusPill tone="yellow">Atenção{s.orderBy ? ` · até ${short(s.orderBy)}` : ""}</StatusPill>
                          : <StatusPill tone="gray">Acompanhar</StatusPill>}
                    </Td>
                    <Td><p className="max-w-[260px] text-[11.5px] leading-relaxed text-zinc-500">{s.reasons.join(" · ") || "—"}</p></Td>
                  </tr>
                ))
              )}
            </TableShell>
          </div>

          {/* Aprendizado */}
          <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#141417] p-5">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-white"><Brain className="size-4 text-zinc-400" /> Como a casa se comporta</h3>
            <p className="mt-0.5 text-[12.5px] text-zinc-500">Pesos aprendidos com o seu histórico (barra) contra a estimativa inicial do segmento (traço) · 1,00 = dia normal</p>
            <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div>
                <p className="mb-2.5 text-[12.5px] font-semibold text-zinc-300">Dia da semana</p>
                <FactorBars items={[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                  const f = data.factors.dow.find((x) => x.dow === dow)!;
                  return { label: f.name, factor: f.factor, prior: f.prior, samples: f.samples, suffix: `${f.samples} dias` };
                })} />
              </div>
              <div>
                <p className="mb-2.5 text-[12.5px] font-semibold text-zinc-300">Mês do ano</p>
                <FactorBars items={data.factors.monthly.map((m) => ({ label: m.name, factor: m.factor, prior: m.prior, samples: m.samples, suffix: `${m.samples} dias` }))} compact />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5 text-[12.5px]">
                <p className="font-semibold text-white">Salário (5º dia útil + 2 dias)</p>
                <p className="mt-1 text-zinc-400">Efeito <strong className="text-zinc-100">{mult(data.factors.payday.factor)}</strong> <span className="text-zinc-600">(estimativa {mult(data.factors.payday.prior)} · {data.factors.payday.samples} dias)</span></p>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5 text-[12.5px]">
                <p className="font-semibold text-white">Vale (+ 1 dia)</p>
                <p className="mt-1 text-zinc-400">Efeito <strong className="text-zinc-100">{mult(data.factors.advance.factor)}</strong> <span className="text-zinc-600">(estimativa {mult(data.factors.advance.prior)} · {data.factors.advance.samples} dias)</span></p>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5 text-[12.5px]">
                <p className="font-semibold text-white">Tendência</p>
                <p className="mt-1 text-zinc-400">{data.factors.trendPctMonth === null ? "Aguardando mais histórico" : <><strong className="text-zinc-100">{data.factors.trendPctMonth > 0 ? "+" : ""}{data.factors.trendPctMonth.toFixed(1)}%/mês</strong> · base {formatCurrency(data.factors.baseDaily)}/dia</>}</p>
              </div>
            </div>
          </div>

          {/* Eventos aprendidos */}
          <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#141417]">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
              <div>
                <h3 className="text-[15px] font-semibold text-white">Datas que movem a casa</h3>
                <p className="mt-0.5 text-[12.5px] text-zinc-500">Peso aprendido × estimativa inicial · a coluna “ano passado” aparece quando a data completa 1 ano de histórico</p>
              </div>
              <button onClick={() => { setEventsDraft(null); setEventsOpen(true); }} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-zinc-300 hover:text-white">
                <Plus className="size-4" /> Novo evento
              </button>
            </div>
            <div className="p-5 pt-3">
              <EventLearningTable
                data={data}
                onAdjust={(key, title, multiplier) => { setEventsDraft({ systemKey: key, title, multiplier }); setEventsOpen(true); }}
              />
            </div>
          </div>

          <details className="group mt-4 rounded-xl border border-white/[0.07] bg-[#141417] p-5">
            <summary className="cursor-pointer text-[14px] font-semibold text-white">Como a previsão é calculada <span className="ml-1 text-[12px] font-normal text-zinc-500">(metodologia aberta)</span></summary>
            <div className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-zinc-400">
              <p><strong className="text-zinc-200">1. Base:</strong> consumo médio diário dessazonalizado + tendência dos últimos 180 dias.</p>
              <p><strong className="text-zinc-200">2. Ritmo semanal e mensal:</strong> cada dia da semana e cada mês tem um peso aprendido com o seu histórico, que começa na estimativa do segmento (sexta/sábado fortes, segunda fraca) e migra para o observado conforme os lançamentos acumulam.</p>
              <p><strong className="text-zinc-200">3. Folha:</strong> salário no 5º dia útil (+2 dias de efeito) e vale no dia 20 (+1 dia), ajustados para dias úteis. O tamanho do efeito é aprendido por ciclo.</p>
              <p><strong className="text-zinc-200">4. Datas:</strong> feriados e comemorativas têm peso inicial calibrado para restaurante japonês (ex.: Dia dos Namorados ×1,90; Dia das Mães ×1,70; Sexta Santa ×1,35). A cada ocorrência real, o peso se aproxima do que aconteceu na sua casa — e após 1 ano a comparação “ano passado” entra automaticamente.</p>
              <p><strong className="text-zinc-200">5. Compras:</strong> para cada item, o consumo médio diário × o índice de cada dia futuro, cobrindo lead time + meta, respeitando o mínimo e com margem de segurança maior em picos e em base nova.</p>
              <p><strong className="text-zinc-200">6. Confiança:</strong> cresce com dias de histórico, cobertura de lançamentos, ciclos de folha e datas observadas. Dias sem lançamento quebram o aprendizado — a casa abre todo dia, então todo dia deveria ter baixa.</p>
            </div>
          </details>
        </div>
      )}

      <DayModal day={selDay} shopping={data?.shopping ?? []} hasHistory={data?.hasHistory ?? false} onClose={() => setDaySel(null)} />
      <EventsModal
        open={eventsOpen}
        draft={eventsDraft}
        onClose={() => { setEventsOpen(false); setEventsDraft(null); }}
        onChanged={() => { load(); refreshAlerts(); }}
        push={push}
      />
    </div>
  );
}

function FactorBars({ items, compact }: { items: { label: string; factor: number; prior: number; samples: number; suffix: string }[]; compact?: boolean }) {
  const max = Math.max(1.7, ...items.map((i) => Math.max(i.factor, i.prior)));
  return (
    <div className={compact ? "grid grid-cols-1 gap-1.5 sm:grid-cols-2" : "space-y-2"}>
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2.5">
          <span className="w-14 shrink-0 text-right text-[12px] text-zinc-400">{i.label}</span>
          <div className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-md bg-white/[0.05]">
            <div className={`h-full rounded-md ${i.factor >= 1.2 ? "bg-gradient-to-r from-amber-600 to-amber-400" : i.factor >= 1 ? "bg-gradient-to-r from-emerald-700 to-emerald-500" : "bg-gradient-to-r from-sky-700 to-sky-500"}`} style={{ width: `${Math.min(100, (i.factor / max) * 100)}%` }} />
            <span className="absolute top-0 h-full w-0.5 bg-white/70" style={{ left: `${Math.min(100, (i.prior / max) * 100)}%` }} title={`Estimativa inicial: ×${i.prior.toFixed(2)}`} />
          </div>
          <span className="w-[88px] shrink-0 text-right text-[12px] tabular-nums"><strong className="text-zinc-100">×{i.factor.toFixed(2)}</strong> <span className="text-zinc-600">{i.suffix}</span></span>
        </div>
      ))}
    </div>
  );
}

function EventLearningTable({ data, onAdjust }: { data: DemandOverview; onAdjust: (key: string, title: string, multiplier: number) => void }) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? data.eventLearning : data.eventLearning.slice(0, 10);
  if (data.eventLearning.length === 0) {
    return <p className="py-6 text-center text-[13px] text-zinc-500">Nenhuma data relevante no horizonte.</p>;
  }
  return (
    <>
      <TableShell
        head={<><Th>Data</Th><Th>Peso usado</Th><Th>Estimativa inicial</Th><Th>Observações</Th><Th>Última vez</Th><Th>Próxima</Th><Th className="text-right">Ajuste</Th></>}
      >
        {rows.map((e) => (
          <tr key={e.key} className="transition hover:bg-white/[0.02]">
            <Td><span className="text-[13px] font-medium text-zinc-100">{e.title}</span>{e.key.startsWith("custom:") ? <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400">da casa</span> : null}</Td>
            <Td><strong className="text-[13px] text-white">{mult(e.learned)}</strong>{e.samples > 0 ? <span className="ml-1.5 text-[11px] text-emerald-400">aprendido</span> : <span className="ml-1.5 text-[11px] text-zinc-500">estimativa</span>}</Td>
            <Td><span className="text-[12.5px] text-zinc-400">{mult(e.prior)}</span></Td>
            <Td><span className="text-[12.5px] text-zinc-300">{e.samples}x</span></Td>
            <Td><span className="text-[12.5px] text-zinc-400">{br(e.lastSeen)}</span></Td>
            <Td><span className="text-[12.5px] text-zinc-300">{e.nextDate ? br(e.nextDate) : "—"}</span></Td>
            <Td className="text-right">
              {!e.key.startsWith("custom:") && e.key !== "payday" && e.key !== "advance" && e.key !== "ponte" ? (
                <button onClick={() => onAdjust(e.key, e.title, e.learned)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11.5px] text-zinc-400 transition hover:text-white">
                  <Pencil className="size-3" /> Ajustar
                </button>
              ) : <span className="text-[11px] text-zinc-600">—</span>}
            </Td>
          </tr>
        ))}
      </TableShell>
      {data.eventLearning.length > 10 ? (
        <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-[12.5px] font-medium text-zinc-400 hover:text-white">
          {showAll ? "Mostrar menos" : `Ver todas (${data.eventLearning.length})`}
        </button>
      ) : null}
    </>
  );
}

function DayModal({ day, shopping, hasHistory, onClose }: { day: DayForecast | null; shopping: ShoppingItem[]; hasHistory: boolean; onClose: () => void }) {
  if (!day) return null;
  const meta = LEVEL_META[day.level];
  const ruptures = shopping.filter((s) => s.ruptureDate === day.date).slice(0, 8);
  const rows = [
    { label: `Dia da semana (${day.weekdayName})`, value: day.dowFactor },
    { label: "Mês", value: day.monthFactor },
    { label: day.isPayday ? "Salário (dia do pagamento)" : day.inPayWindow ? "Janela pós-salário" : day.isAdvance ? "Vale (dia do adiantamento)" : day.inAdvanceWindow ? "Janela pós-vale" : "Folha (fora de janela)", value: day.paydayFactor },
    { label: "Eventos do dia", value: day.eventFactor },
  ];
  return (
    <Modal open onClose={onClose} title={`${day.weekdayName} · ${br(day.date)}`} subtitle="Por que a previsão deste dia é esta" wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-bold ${meta.cell} ${meta.text}`}>
            <span className={`size-2 rounded-full ${meta.dot}`} /> {meta.label} · índice ×{day.index.toFixed(2)} ({deltaPct(day.index)})
          </span>
          {hasHistory ? (
            <span className="text-[13px] text-zinc-300">Projeção <strong className="text-white">{formatCurrency(day.value)}</strong> <span className="text-zinc-500">({formatCurrency(day.low)} – {formatCurrency(day.high)})</span></span>
          ) : (
            <span className="text-[12.5px] text-zinc-500">Valor em R$ aparece após os primeiros lançamentos</span>
          )}
          <span className="ml-auto text-[12px] text-zinc-500">Confiança <strong className="text-zinc-200">{hasHistory ? `${day.confidence}%` : "—"}</strong></span>
        </div>
        {hasHistory ? (
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-400" style={{ width: `${day.confidence}%` }} />
          </div>
        ) : null}
        <div>
          <p className="mb-2 text-[12.5px] font-semibold text-zinc-300">Composição do índice (multiplicação dos fatores)</p>
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.015] px-3.5 py-2 text-[12.5px]">
                <span className="flex-1 text-zinc-400">{r.label}</span>
                <strong className={r.value >= 1.2 ? "text-amber-300" : r.value < 0.9 ? "text-sky-300" : "text-zinc-100"}>×{r.value.toFixed(2)}</strong>
              </div>
            ))}
          </div>
        </div>
        {day.events.length > 0 ? (
          <div>
            <p className="mb-2 text-[12.5px] font-semibold text-zinc-300">Eventos do dia</p>
            <div className="space-y-1.5">
              {day.events.map((e) => (
                <div key={e.key} className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3.5 py-2.5 text-[12.5px]">
                  <p className="font-semibold text-white">{e.title} <span className="ml-1 font-normal text-zinc-500">· peso {mult(e.mult)}{e.learned ? "" : " (estimativa)"}</span></p>
                  <p className="mt-0.5 text-zinc-500">
                    {e.learned ? `Aprendido com ${e.samples} ocorrência(ões) na sua casa` : "Ainda sem ocorrência registrada — vale a estimativa do segmento"}
                    {e.lastYearMult !== null ? ` · ano passado: ${mult(e.lastYearMult)}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[12.5px] text-zinc-500">Nenhum evento neste dia — a previsão segue ritmo semanal, mês e folha.</p>
        )}
        {ruptures.length > 0 ? (
          <div>
            <p className="mb-2 text-[12.5px] font-semibold text-zinc-300">Itens que zeram neste dia</p>
            <div className="space-y-1">
              {ruptures.map((r) => (
                <p key={r.itemId} className="text-[12.5px] text-red-300">• {r.name} — comprar {formatQty(r.suggestion)} {r.unit}</p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function EventsModal({ open, draft, onClose, onChanged, push }: {
  open: boolean;
  draft: { systemKey: string; title: string; multiplier: number } | null;
  onClose: () => void;
  onChanged: () => void;
  push: ReturnType<typeof useToast>["push"];
}) {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Partial<EventRow> & { mode?: "date" | "annual" } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<{ events: EventRow[] }>("/api/demand/events");
    if (r.ok) setRows(r.data.events ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    if (draft) {
      setEditing({ systemKey: draft.systemKey, title: draft.title, multiplier: String(draft.multiplier), kind: "override", active: true });
    } else {
      setEditing(null);
    }
  }, [open, draft, load]);

  if (!open) return null;

  const startNew = () => setEditing({ title: "", kind: "custom", multiplier: "1.300", windowBefore: 0, windowAfter: 0, active: true, mode: "annual", month: new Date().getMonth() + 1, day: 1 });
  const isOverride = !!editing?.systemKey;

  const save = async () => {
    if (!editing || saving) return;
    if (!editing.title?.trim()) {
      push({ kind: "error", title: "Informe o título do evento" });
      return;
    }
    const m = Number(editing.multiplier);
    if (!Number.isFinite(m) || m < 0.3 || m > 3) {
      push({ kind: "error", title: "Multiplicador deve ficar entre 0,3 (queda de 70%) e 3 (triplo)" });
      return;
    }
    if (!isOverride) {
      if (editing.mode === "date" && !editing.date) {
        push({ kind: "error", title: "Informe a data do evento" });
        return;
      }
      if (editing.mode !== "date" && (!editing.month || !editing.day)) {
        push({ kind: "error", title: "Informe mês e dia" });
        return;
      }
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      title: editing.title.trim(),
      kind: editing.kind ?? "custom",
      multiplier: m,
      windowBefore: editing.windowBefore ?? 0,
      windowAfter: editing.windowAfter ?? 0,
      notes: editing.notes ?? "",
      active: editing.active ?? true,
    };
    if (isOverride) payload.systemKey = editing.systemKey;
    else if (editing.mode === "date") payload.date = editing.date;
    else {
      payload.month = editing.month;
      payload.day = editing.day;
    }
    const r = editing.id && !isOverride
      ? await api(`/api/demand/events/${editing.id}`, { method: "PATCH", json: payload })
      : await api("/api/demand/events", { method: "POST", json: payload });
    setSaving(false);
    if (r.ok) {
      push({ kind: "success", title: isOverride ? "Ajuste salvo" : editing.id ? "Evento atualizado" : "Evento criado" });
      setEditing(null);
      load();
      onChanged();
    } else {
      push({ kind: "error", title: "Não foi possível salvar", msg: r.error });
    }
  };

  const remove = async (row: EventRow) => {
    if (!confirm(row.systemKey ? `Voltar "${row.title}" ao padrão do sistema?` : `Excluir "${row.title}"?`)) return;
    const r = await api(`/api/demand/events/${row.id}`, { method: "DELETE" });
    if (r.ok) {
      push({ kind: "success", title: "Removido" });
      load();
      onChanged();
    } else {
      push({ kind: "error", title: "Não foi possível remover", msg: r.error });
    }
  };

  const toggle = async (row: EventRow) => {
    const r = await api(`/api/demand/events/${row.id}`, { method: "PATCH", json: { active: !row.active } });
    if (r.ok) {
      load();
      onChanged();
    }
  };

  const when = (row: EventRow) =>
    row.systemKey ? "evento do sistema" : row.date ? `único · ${br(row.date)}` : `todo ano · ${String(row.day).padStart(2, "0")}/${String(row.month).padStart(2, "0")}`;

  return (
    <Modal open onClose={onClose} wide title="Eventos do calendário" subtitle="Aniversário da casa, festival do bairro, reforma, jogo decisivo — tudo que mexe com o movimento">
      <div className="space-y-4">
        {!editing ? (
          <div className="flex justify-end">
            <PrimaryButton onClick={startNew}><Plus className="size-4" /> Novo evento</PrimaryButton>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-white/[0.1] bg-white/[0.02] p-4">
            {isOverride ? (
              <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 text-[12.5px] text-amber-200">
                Ajustando o evento do sistema <strong>{editing.title}</strong>. O aprendizado com seu histórico continua valendo — este valor vira a nova estimativa inicial.
              </p>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Título" required>
                <input value={editing.title ?? ""} maxLength={120} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Ex.: Aniversário da casa" className={inputCls} />
              </Field>
              <Field label="Multiplicador esperado" required hint="1,30 = +30% · 0,80 = −20% · Namorados usa 1,90">
                <input type="number" min={0.3} max={3} step={0.05} value={editing.multiplier ?? "1.3"} onChange={(e) => setEditing({ ...editing, multiplier: e.target.value })} className={inputCls} />
              </Field>
            </div>
            {!isOverride ? (
              <>
                <div className="flex gap-2">
                  {(["annual", "date"] as const).map((m) => (
                    <button key={m} onClick={() => setEditing({ ...editing, mode: m })} className={`rounded-lg border px-3.5 py-2 text-[12.5px] font-medium transition ${editing.mode !== "date" && m === "annual" || editing.mode === "date" && m === "date" ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-zinc-400 hover:text-white"}`}>
                      {m === "annual" ? "Todo ano" : "Data única"}
                    </button>
                  ))}
                  <div className="ml-auto flex items-center gap-2 text-[12px] text-zinc-500">
                    {editing.active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    <Toggle checked={editing.active ?? true} onChange={(v) => setEditing({ ...editing, active: v })} label={editing.active === false ? "Inativo" : "Ativo"} />
                  </div>
                </div>
                {editing.mode === "date" ? (
                  <Field label="Data" required><input type="date" value={editing.date ?? ""} onChange={(e) => setEditing({ ...editing, date: e.target.value })} className={inputCls} /></Field>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Mês" required>
                      <select value={editing.month ?? 1} onChange={(e) => setEditing({ ...editing, month: Number(e.target.value) })} className={inputCls}>
                        {MONTH_FULL.map((m, i) => <option key={m} value={i + 1} className="bg-zinc-900">{m}</option>)}
                      </select>
                    </Field>
                    <Field label="Dia" required><input type="number" min={1} max={31} value={editing.day ?? 1} onChange={(e) => setEditing({ ...editing, day: Number(e.target.value) })} className={inputCls} /></Field>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Dias de efeito antes" hint="Ex.: véspera aquecida"><input type="number" min={0} max={7} value={editing.windowBefore ?? 0} onChange={(e) => setEditing({ ...editing, windowBefore: Number(e.target.value) })} className={inputCls} /></Field>
                  <Field label="Dias de efeito depois" hint="Ex.: ressaca do evento"><input type="number" min={0} max={7} value={editing.windowAfter ?? 0} onChange={(e) => setEditing({ ...editing, windowAfter: Number(e.target.value) })} className={inputCls} /></Field>
                </div>
                <Field label="Observações"><input value={editing.notes ?? ""} maxLength={500} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Opcional" className={inputCls} /></Field>
              </>
            ) : (
              <div className="flex items-center gap-2 text-[12px] text-zinc-500">
                <Toggle checked={editing.active ?? true} onChange={(v) => setEditing({ ...editing, active: v })} label={editing.active === false ? "Evento desligado" : "Evento ativo"} />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} disabled={saving} className="rounded-lg border border-white/10 px-4 py-2.5 text-[13px] font-medium text-zinc-300 hover:text-white disabled:opacity-50">Cancelar</button>
              <PrimaryButton onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</PrimaryButton>
            </div>
          </div>
        )}

        {loading ? (
          <LoadingRows label="Carregando eventos…" />
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-[13px] text-zinc-500">
            Nenhum evento personalizado. O calendário do sistema (feriados, datas comemorativas e folha) já está valendo.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className={`flex flex-wrap items-center gap-3 rounded-xl border p-3.5 ${row.active ? "border-white/[0.07] bg-white/[0.015]" : "border-white/[0.05] opacity-60"}`}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-white">
                    {row.title}
                    {row.systemKey ? <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">ajuste do sistema</span> : <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400">da casa</span>}
                    {!row.active ? <StatusPill tone="gray">Inativo</StatusPill> : null}
                  </p>
                  <p className="mt-0.5 text-[12px] text-zinc-500">
                    {when(row)} · peso ×{Number(row.multiplier).toFixed(2)}
                    {(row.windowBefore || row.windowAfter) ? ` · janela −${row.windowBefore}/+${row.windowAfter}d` : ""}
                    {row.notes ? ` · ${row.notes}` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button title={row.active ? "Desligar" : "Ativar"} onClick={() => toggle(row)} className="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white">
                    {row.active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </button>
                  {!row.systemKey ? (
                    <button title="Editar" onClick={() => setEditing({ ...row, mode: row.date ? "date" : "annual" })} className="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white">
                      <Pencil className="size-4" />
                    </button>
                  ) : null}
                  <button title={row.systemKey ? "Voltar ao padrão" : "Excluir"} onClick={() => remove(row)} className="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-red-400">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
