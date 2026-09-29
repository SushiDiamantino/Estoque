"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  TriangleAlert,
  AlertCircle,
  RefreshCw,
  SlidersHorizontal,
  CheckCircle2,
  BellOff,
  Loader2,
  Info,
} from "lucide-react";
import { StatCard, PageBadge, LoadingRows, Toggle } from "@/components/ui";
import { PdfButton } from "@/components/PdfButton";
import { pdfList } from "@/lib/pdf/docs";
import { useToast } from "@/components/Toast";
import { useApp } from "@/components/AppContext";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

type Severity = "critico" | "atencao" | "informativo";
type Alert = { id: string; key: string; severity: Severity; title: string; message: string; kind: string; href: string };
type Payload = {
  alerts: Alert[];
  counts: Record<Severity, number>;
  snoozed: number;
  settings: { lowStockNotify: boolean; expiryNotify: boolean; expiryDays: number; demandNotify?: boolean; demandAlertDays?: number };
};

const SEV_LABEL: Record<Severity, string> = { critico: "Crítico", atencao: "Atenção", informativo: "Informativo" };
const KIND_LABEL: Record<string, string> = {
  "low-stock": "Estoque mínimo",
  expiry: "Validade",
  inventory: "Inventário",
  draft: "Rascunhos",
  loan: "Empréstimos",
  demand: "Demanda",
};

export default function AlertasPage() {
  const { push } = useToast();
  const { org, refreshAlerts } = useApp();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Severity>("all");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [days, setDays] = useState("7");
  const [savingRules, setSavingRules] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<Payload>("/api/alerts");
    if (r.ok) {
      setData(r.data);
      setDays(String(r.data.settings?.expiryDays ?? 7));
    } else {
      push({ kind: "error", title: "Não foi possível carregar os alertas", msg: r.error });
    }
    setLoading(false);
  }, [push]);

  useEffect(() => {
    load();
  }, [load]);

  const saveRules = async (patch: Record<string, unknown>) => {
    if (savingRules) return;
    setSavingRules(true);
    const r = await api("/api/settings", { method: "PUT", json: patch });
    setSavingRules(false);
    if (r.ok) {
      push({ kind: "success", title: "Regras atualizadas" });
      await load();
      refreshAlerts();
    } else {
      push({ kind: "error", title: "Não foi possível salvar as regras", msg: r.error });
    }
  };

  const snooze = async (a: Alert) => {
    if (busyKey) return;
    setBusyKey(a.key);
    const r = await api("/api/alerts", {
      method: "POST",
      json: { key: a.key, title: a.title, severity: a.severity, hours: 24 },
    });
    setBusyKey(null);
    if (r.ok) {
      push({ kind: "info", title: "Alerta silenciado por 24 horas", msg: a.title });
      await load();
      refreshAlerts();
    } else {
      push({ kind: "error", title: "Não foi possível silenciar", msg: r.error });
    }
  };

  const unsnooze = async () => {
    const r = await api("/api/alerts", { method: "DELETE" });
    if (r.ok) {
      push({ kind: "success", title: "Alertas silenciados foram reexibidos" });
      await load();
      refreshAlerts();
    }
  };

  const counts = data?.counts ?? { critico: 0, atencao: 0, informativo: 0 };
  const visible = (data?.alerts ?? []).filter((a) => filter === "all" || a.severity === filter);
  const daysNum = Number(days);
  const daysValid = Number.isFinite(daysNum) && daysNum >= 1 && daysNum <= 60;

  const exportPdf = (print: boolean) =>
    pdfList<Alert>({
      org: org.name,
      title: "Central de alertas",
      subtitle: "Ocorrências que exigem ação: estoque mínimo, validade, empréstimos, inventário e demanda.",
      print,
      kpis: [
        { label: "Críticos", value: String(counts.critico), tone: counts.critico > 0 ? "red" : "green" },
        { label: "Atenção", value: String(counts.atencao), tone: counts.atencao > 0 ? "amber" : undefined },
        { label: "Informativos", value: String(counts.informativo) },
      ],
      columns: [
        { header: "Prioridade", align: "center", value: (a) => SEV_LABEL[a.severity] },
        { header: "Tipo", value: (a) => KIND_LABEL[a.kind] ?? a.kind },
        { header: "Alerta", value: (a) => a.title },
        { header: "Detalhe", value: (a) => a.message },
      ],
      rows: visible,
      rowTone: (a) => (a.severity === "critico" ? "red" : a.severity === "atencao" ? "amber" : null),
      filename: "alertas",
    });

  return (
    <div className="animate-fade-in">
      <p className="text-[12px] text-zinc-500">
        Gestão <span className="mx-1.5 text-zinc-700">›</span> <span className="text-zinc-300">Alertas</span>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-[28px] font-bold tracking-tight text-white">Alertas</h2>
            <PageBadge>Tempo real</PageBadge>
          </div>
          <p className="mt-1.5 text-[13.5px] text-zinc-400">
            Regras para estoque mínimo, validade, vencimentos e ocorrências críticas.
          </p>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={() => setRulesOpen((v) => !v)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-[13px] font-medium transition",
              rulesOpen ? "border-white/25 bg-white/[0.06] text-white" : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:text-white"
            )}
          >
            <SlidersHorizontal className="size-4" /> Regras
          </button>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[13px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
          <PdfButton build={exportPdf} disabled={visible.length === 0} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Críticos" value={counts.critico} hint="Exigem ação imediata" icon={<AlertCircle className="size-4" />} accent={counts.critico > 0 ? <span className="size-1.5 rounded-full bg-red-500" /> : null} />
        <StatCard label="Atenção" value={counts.atencao} hint="Vencimentos e níveis baixos" icon={<TriangleAlert className="size-4" />} accent={counts.atencao > 0 ? <span className="size-1.5 rounded-full bg-amber-400" /> : null} />
        <StatCard label="Informativos" value={counts.informativo} hint="Inventários e pendências" icon={<Info className="size-4" />} />
      </div>

      {rulesOpen && data ? (
        <div className="animate-fade-in mt-4 rounded-xl border border-white/[0.07] bg-[#141417] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-white">Regras de alerta</p>
              <p className="mt-0.5 text-[12.5px] text-zinc-500">Valem para todo o sistema: painel, sino e esta central. Salvas no banco.</p>
            </div>
            {savingRules ? <Loader2 className="size-4 animate-spin text-zinc-400" /> : null}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
              <Toggle checked={data.settings.lowStockNotify} onChange={(v) => saveRules({ lowStockNotify: v })} label="Estoque mínimo" />
              <p className="mt-2 text-[12px] text-zinc-500">Alerta quando o saldo total fica abaixo do mínimo do item.</p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
              <Toggle checked={data.settings.expiryNotify} onChange={(v) => saveRules({ expiryNotify: v })} label="Validade e vencimentos" />
              <p className="mt-2 text-[12px] text-zinc-500">Lotes vencidos ou vencendo dentro da janela.</p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
              <Toggle checked={data.settings.demandNotify ?? true} onChange={(v) => saveRules({ demandNotify: v })} label="Picos de demanda" />
              <p className="mt-2 text-[12px] text-zinc-500">Feriados, pagamentos e rupturas previstas pela Central de Demanda.</p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
              <p className="text-[13px] font-medium text-zinc-300">Janela de vencimento</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="w-20 rounded-lg border border-white/[0.08] bg-[#0e0e10] px-3 py-2 text-center text-[13px] text-white outline-none focus:border-white/25"
                />
                <span className="text-[12.5px] text-zinc-500">dias</span>
                <button
                  onClick={() => saveRules({ expiryDays: daysNum })}
                  disabled={!daysValid || daysNum === data.settings.expiryDays || savingRules}
                  className="ml-auto rounded-lg border border-white/10 px-3 py-2 text-[12.5px] font-semibold text-zinc-200 transition hover:text-white disabled:opacity-40"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#141417]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div>
            <h3 className="text-[15px] font-semibold text-white">Central de notificações</h3>
            {data && data.snoozed > 0 ? (
              <p className="mt-0.5 text-[12.5px] text-zinc-500">
                {data.snoozed} alerta(s) silenciado(s) ·{" "}
                <button onClick={unsnooze} className="text-zinc-300 underline-offset-2 hover:underline">
                  reexibir todos
                </button>
              </p>
            ) : (
              <p className="mt-0.5 text-[12.5px] text-zinc-500">Clique em um alerta para ir direto ao ponto de ação.</p>
            )}
          </div>
          <div className="flex gap-1 rounded-lg border border-white/[0.08] bg-[#1a1a1f] p-1 text-[12.5px] font-medium">
            {(
              [
                { v: "all", l: "Todos" },
                { v: "critico", l: "Críticos" },
                { v: "atencao", l: "Atenção" },
                { v: "informativo", l: "Info" },
              ] as const
            ).map((t) => (
              <button
                key={t.v}
                onClick={() => setFilter(t.v)}
                className={cn("rounded-md px-3 py-1.5 transition", filter === t.v ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300")}
              >
                {t.l}
              </button>
            ))}
          </div>
        </div>

        {loading && !data ? (
          <LoadingRows label="Verificando regras…" />
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="grid size-[68px] place-items-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
              <CheckCircle2 className="size-7" />
            </div>
            <h3 className="mt-5 text-[16px] font-semibold text-white">Tudo sob controle</h3>
            <p className="mt-2 max-w-sm text-[13.5px] text-zinc-500">
              Nenhum alerta para o filtro atual. O sistema monitora saldos, validades e inventários automaticamente.
            </p>
          </div>
        ) : (
          <div className={cn("space-y-2.5 p-5", loading ? "opacity-60" : "")}>
            {visible.map((a) => (
              <div
                key={a.id}
                className={cn(
                  "flex items-start gap-3.5 rounded-xl border p-4 transition",
                  a.severity === "critico"
                    ? "border-red-500/20 bg-red-500/[0.05] hover:bg-red-500/[0.08]"
                    : a.severity === "atencao"
                      ? "border-amber-500/20 bg-amber-500/[0.05] hover:bg-amber-500/[0.08]"
                      : "border-white/[0.07] bg-white/[0.015] hover:bg-white/[0.03]"
                )}
              >
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-lg border",
                    a.severity === "critico"
                      ? "border-red-500/20 bg-red-500/10 text-red-300"
                      : a.severity === "atencao"
                        ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                        : "border-white/10 bg-white/[0.04] text-zinc-300"
                  )}
                >
                  {a.severity === "critico" ? <AlertCircle className="size-5" /> : a.severity === "atencao" ? <TriangleAlert className="size-5" /> : <Bell className="size-5" />}
                </span>
                <Link href={a.href} className="group min-w-0 flex-1">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    {SEV_LABEL[a.severity]}
                    {KIND_LABEL[a.kind] ? ` · ${KIND_LABEL[a.kind]}` : ""}
                  </p>
                  <p className="mt-0.5 text-[14px] font-semibold text-white group-hover:underline">{a.title}</p>
                  <p className="mt-0.5 text-[12.5px] text-zinc-400">{a.message}</p>
                </Link>
                <button
                  onClick={() => snooze(a)}
                  disabled={busyKey === a.key}
                  title="Silenciar por 24 horas"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11.5px] font-medium text-zinc-400 transition hover:text-white disabled:opacity-50"
                >
                  {busyKey === a.key ? <Loader2 className="size-3.5 animate-spin" /> : <BellOff className="size-3.5" />}
                  <span className="hidden sm:inline">24h</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
