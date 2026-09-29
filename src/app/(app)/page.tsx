"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Package,
  Warehouse,
  TriangleAlert,
  TrendingDown,
  Clock3,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  ChevronRight,
  RefreshCw,
  Plus,
  ClipboardCheck,
  Bell,
  BarChart3,
  Handshake,
  Sparkles,
} from "lucide-react";
import { formatDateBR, formatDateTime, formatQty, greetingByHour, timeAgo } from "@/lib/format";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";

type DashboardData = {
  stats: {
    itemsInStock: number;
    itemsActive: number;
    locations: number;
    totalQty: number;
    belowMin: number;
    alerts: number;
    expiring: number;
    expired: number;
    drafts: number;
  };
  loans: { toReceive: number; toReturn: number; overdue: number; dueSoon: number; dueDays: number };
  demand: {
    nextPeak: { date: string; label: string; title: string; mult: number; daysLeft: number } | null;
    avgIndex7: number;
    criticalCount: number;
    shoppingTotal: number;
    score: number;
    levelLabel: string;
    hasHistory: boolean;
  } | null;
  inventory: {
    open: number;
    next: { code: string; status: string; scheduledFor: string | null; locationName: string | null } | null;
  };
  recent: {
    id: string;
    code: string;
    type: string;
    status: string;
    supplier: string | null;
    responsible: string | null;
    reason: string | null;
    movementDate: string;
    createdAt: string;
    itemCount: number;
    firstItem: string | null;
    sourceName: string | null;
    destName: string | null;
  }[];
  distribution: { id: string; name: string; type: string; qty: string; skus: number }[];
  lowItems: { id: string; name: string; sku: string; unit: string; minStock: string; qty: string }[];
  byDay: { day: string; entradas: number; saidas: number; transferencias: number }[];
};

const TYPE_META: Record<string, { label: string; icon: typeof ArrowDownToLine }> = {
  entrada: { label: "Entrada", icon: ArrowDownToLine },
  saida: { label: "Saída", icon: ArrowUpFromLine },
  transferencia: { label: "Transferência", icon: ArrowLeftRight },
};

export default function DashboardPage() {
  const { push } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState("Olá");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // calculado só no cliente: evita divergência de fuso entre servidor e navegador
  useEffect(() => {
    setGreeting(greetingByHour());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<DashboardData>("/api/dashboard");
    if (r.ok) {
      setData(r.data);
      setUpdatedAt(new Date());
    } else {
      push({ kind: "error", title: "Não foi possível carregar o painel", msg: r.error });
    }
    setLoading(false);
  }, [push]);

  useEffect(() => {
    load();
  }, [load]);

  const st = data?.stats;
  const inv = data?.inventory;
  const ln = data?.loans;
  const dm = data?.demand;
  const maxDist = Math.max(1, ...(data?.distribution.map((d) => Number(d.qty)) ?? [1]));
  const maxDay = Math.max(1, ...(data?.byDay ?? []).map((x) => x.entradas + x.saidas + x.transferencias));

  return (
    <div className="animate-fade-in">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Visão geral</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[26px] font-bold tracking-tight text-white sm:text-[30px]">{greeting}, Operador</h2>
          <p className="mt-1 text-[13.5px] text-zinc-400">Resumo da operação de estoque · dados em tempo real do sistema.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[12.5px] text-zinc-400">
            <span className="size-1.5 rounded-full bg-emerald-400" /> Operação ativa
          </span>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12.5px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Itens em estoque"
          value={loading && !data ? "—" : String(st?.itemsInStock ?? 0)}
          hint={loading && !data ? "carregando…" : `${st?.itemsActive ?? 0} ativos · ${formatQty(st?.totalQty)} un. em saldo`}
          icon={<Package className="size-4" />}
          href="/itens"
        />
        <KpiCard
          label="Locais de armazenamento"
          value={loading && !data ? "—" : String(st?.locations ?? 0)}
          hint="Espaços ativos na operação"
          icon={<Warehouse className="size-4" />}
          href="/locais"
        />
        <KpiCard
          label="Alertas ativos"
          value={loading && !data ? "—" : String(st?.alerts ?? 0)}
          hint={
            !st
              ? "verificando…"
              : st.expired > 0
                ? `${st.expired} lote(s) vencido(s) · ${st.expiring} vencendo`
                : st.expiring > 0
                  ? `${st.expiring} lote(s) vencendo em breve`
                  : "Nenhum vencimento crítico"
          }
          icon={<TriangleAlert className="size-4" />}
          href="/alertas"
          alert={(st?.alerts ?? 0) > 0}
        />
        <KpiCard
          label="Itens abaixo do mínimo"
          value={loading && !data ? "—" : String(st?.belowMin ?? 0)}
          hint={(st?.belowMin ?? 0) > 0 ? "Precisam de reposição" : "Todos os níveis saudáveis"}
          icon={<TrendingDown className="size-4" />}
          href="/alertas"
          alert={(st?.belowMin ?? 0) > 0}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <QuickAction href="/entradas" icon={<ArrowDownToLine className="size-4" />} label="Nova entrada" />
        <QuickAction href="/saidas" icon={<ArrowUpFromLine className="size-4" />} label="Nova saída" />
        <QuickAction href="/transferencias" icon={<ArrowLeftRight className="size-4" />} label="Transferir" />
        <QuickAction href="/emprestimos" icon={<Handshake className="size-4" />} label="Empréstimo" />
        <QuickAction href="/demanda" icon={<Sparkles className="size-4" />} label="Central de Demanda" />
        <QuickAction href="/itens" icon={<Plus className="size-4" />} label="Cadastrar item" />
        <QuickAction href="/inventario" icon={<ClipboardCheck className="size-4" />} label="Iniciar inventário" />
        <QuickAction href="/relatorios" icon={<BarChart3 className="size-4" />} label="Ver relatórios" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <div className="rounded-xl border border-white/[0.07] bg-[#141417]">
          <div className="flex items-center justify-between gap-3 px-5 pt-5">
            <div>
              <h3 className="text-[15px] font-semibold text-white">Movimentações recentes</h3>
              <p className="mt-0.5 text-[12.5px] text-zinc-500">Últimas entradas, saídas e transferências registradas</p>
            </div>
            <Link href="/entradas" className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-zinc-300 transition hover:text-white">
              Ver tudo <ChevronRight className="size-4" />
            </Link>
          </div>
          <div className="space-y-2.5 p-5">
            {loading && !data ? (
              [1, 2, 3].map((i) => <div key={i} className="h-[68px] animate-pulse rounded-xl bg-white/[0.04]" />)
            ) : (data?.recent.length ?? 0) === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-10 text-center">
                <Clock3 className="mx-auto size-7 text-zinc-600" />
                <p className="mt-3 text-[13.5px] font-semibold text-zinc-300">Nenhuma movimentação ainda</p>
                <p className="mx-auto mt-1 max-w-xs text-[12.5px] text-zinc-500">Registre a primeira entrada para começar a alimentar o saldo do estoque.</p>
                <Link href="/entradas" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-[13px] font-semibold text-zinc-950 hover:bg-white">
                  <Plus className="size-4" /> Nova entrada
                </Link>
              </div>
            ) : (
              data?.recent.map((m) => {
                const meta = TYPE_META[m.type] ?? TYPE_META.entrada;
                const Icon = meta.icon;
                const where =
                  m.type === "transferencia"
                    ? `${m.sourceName ?? "?"} → ${m.destName ?? "?"}`
                    : m.type === "entrada"
                      ? `${m.supplier || "Recebimento"} · ${m.destName ?? "—"}`
                      : `${m.reason || "Saída"} · ${m.sourceName ?? "—"}`;
                return (
                  <div key={m.id} className={`flex items-center gap-3.5 rounded-xl border border-transparent p-2.5 transition hover:border-white/[0.07] hover:bg-white/[0.02] ${m.status === "estornada" ? "opacity-60" : ""}`}>
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-zinc-400">
                      <Clock3 className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-white">
                        {m.firstItem ?? m.code}
                        {m.itemCount > 1 ? (
                          <span className="ml-1.5 font-normal text-zinc-500">
                            +{m.itemCount - 1} {m.itemCount - 1 === 1 ? "item" : "itens"}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-zinc-500">
                        {m.code} · {where} · {timeAgo(m.createdAt)}
                        {m.status !== "confirmada" ? ` · ${m.status}` : ""}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[12px] font-medium text-zinc-300">
                      <Icon className="size-3.5" />
                      {meta.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-[#141417]">
          <div className="px-5 pt-5">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-white">
              <Bell className="size-4 text-zinc-400" /> Alertas
            </h3>
            <p className="mt-0.5 text-[12.5px] text-zinc-500">Notificações que exigem atenção</p>
          </div>
          <div className="space-y-2.5 p-5">
            <AlertCard
              tone="red"
              kicker="Crítico"
              title="Estoque abaixo do mínimo"
              desc={!st ? "Verificando níveis…" : st.belowMin > 0 ? `${st.belowMin} item(ns) precisam de reposição imediata` : "Nenhum item crítico no momento"}
              href="/alertas"
            />
            <AlertCard
              tone="yellow"
              kicker="Atenção"
              title="Validade próxima"
              desc={!st ? "Verificando lotes…" : st.expired + st.expiring > 0 ? `${st.expired > 0 ? `${st.expired} vencido(s) · ` : ""}${st.expiring} lote(s) vencendo em breve` : "Nenhum vencimento na janela configurada"}
              href="/alertas"
            />
            <AlertCard
              tone="gray"
              kicker="Informativo"
              title={!inv?.next ? "Nenhum inventário pendente" : inv.next.status === "em_contagem" ? "Inventário em andamento" : "Inventário agendado"}
              desc={
                !inv?.next
                  ? "Agende uma contagem cíclica para manter a acurácia"
                  : `${inv.next.code} · ${inv.next.locationName ?? "geral"}${inv.next.scheduledFor ? ` · previsto ${formatDateBR(inv.next.scheduledFor)}` : ""}${inv.open > 1 ? ` · +${inv.open - 1} pendente(s)` : ""}`
              }
              href="/inventario"
            />
            {ln && (ln.toReceive + ln.toReturn > 0) ? (
              <AlertCard
                tone={ln.overdue > 0 ? "red" : ln.dueSoon > 0 ? "yellow" : "gray"}
                kicker={ln.overdue > 0 ? "Crítico" : ln.dueSoon > 0 ? "Atenção" : "Empréstimos"}
                title={ln.overdue > 0 ? `${ln.overdue} empréstimo(s) vencido(s)` : ln.dueSoon > 0 ? `${ln.dueSoon} empréstimo(s) vencem em ${ln.dueDays} dia(s)` : "Empréstimos em dia"}
                desc={`${ln.toReceive} a receber de parceiros · ${ln.toReturn} a devolver`}
                href="/emprestimos"
              />
            ) : null}
            {dm?.nextPeak ? (
              <AlertCard
                tone={dm.nextPeak.mult >= 1.6 || dm.nextPeak.daysLeft <= 3 ? "red" : "yellow"}
                kicker="Demanda"
                title={`Pico: ${dm.nextPeak.title}`}
                desc={`${dm.nextPeak.label} · ${dm.nextPeak.daysLeft === 0 ? "hoje" : dm.nextPeak.daysLeft === 1 ? "amanhã" : `em ${dm.nextPeak.daysLeft} dias`} · +${Math.round((dm.nextPeak.mult - 1) * 100)}% de demanda${dm.criticalCount > 0 ? ` · ${dm.criticalCount} item(ns) em risco` : ""}`}
                href="/demanda"
              />
            ) : dm && dm.hasHistory ? (
              <AlertCard tone="gray" kicker="Demanda" title="Sem picos nos próximos 14 dias" desc="Movimento dentro do padrão — confira a Central de Demanda" href="/demanda" />
            ) : null}
            {(st?.drafts ?? 0) > 0 ? (
              <AlertCard tone="yellow" kicker="Pendência" title="Rascunhos aguardando confirmação" desc={`${st?.drafts} movimentação(ões) ainda não alteraram o estoque`} href="/entradas" />
            ) : null}
            {(data?.lowItems.length ?? 0) > 0 ? (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Menor cobertura do mínimo</p>
                <div className="mt-2.5 space-y-2">
                  {data?.lowItems.slice(0, 4).map((it) => {
                    const low = Number(it.qty) < Number(it.minStock);
                    return (
                      <div key={it.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                        <span className="truncate font-medium text-zinc-300">{it.name}</span>
                        <span className={`shrink-0 ${low ? "text-red-300" : "text-zinc-500"}`}>
                          {formatQty(it.qty)} / {formatQty(it.minStock)} {it.unit}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-white/[0.07] bg-[#141417] p-5">
          <h3 className="text-[15px] font-semibold text-white">Distribuição por local</h3>
          <p className="mt-0.5 text-[12.5px] text-zinc-500">Saldo consolidado por endereço interno</p>
          <div className="mt-4 space-y-3.5">
            {loading && !data ? (
              [1, 2, 3].map((i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-white/[0.04]" />)
            ) : (data?.distribution.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-[13px] text-zinc-500">Nenhum local ativo.</p>
            ) : (
              data?.distribution.map((d) => {
                const pct = Math.round((Number(d.qty) / maxDist) * 100);
                return (
                  <div key={d.id}>
                    <div className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="truncate font-medium text-zinc-200">{d.name}</span>
                      <span className="shrink-0 text-zinc-500">{formatQty(d.qty)} un. · {d.skus} SKU(s)</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-gradient-to-r from-zinc-400 to-white" style={{ width: `${Math.max(pct, 3)}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <p className="mt-4 border-t border-white/[0.06] pt-3 text-[11.5px] text-zinc-600">
            Atualizado {updatedAt ? `em ${formatDateTime(updatedAt)}` : "—"} ·{" "}
            <Link href="/locais" className="text-zinc-400 underline-offset-2 hover:underline">gerenciar locais</Link>
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-[#141417] p-5">
          <h3 className="text-[15px] font-semibold text-white">Atividade dos últimos 7 dias</h3>
          <p className="mt-0.5 text-[12.5px] text-zinc-500">Movimentações confirmadas ou estornadas por dia</p>
          <div className="mt-5 flex h-[150px] items-end justify-between gap-2">
            {(data?.byDay ?? []).map((d) => {
              const total = d.entradas + d.saidas + d.transferencias;
              const h = Math.max((total / maxDay) * 110, 6);
              return (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-[11px] font-semibold text-zinc-400">{total}</span>
                  <div
                    className={`flex w-full max-w-[44px] flex-col-reverse overflow-hidden rounded-t-lg border border-white/10 ${total === 0 ? "bg-white/[0.04]" : ""}`}
                    style={{ height: `${h}px` }}
                    title={`${d.day}: ${d.entradas} entradas · ${d.saidas} saídas · ${d.transferencias} transf.`}
                  >
                    <div className="bg-emerald-400/80" style={{ flexGrow: d.entradas }} />
                    <div className="bg-amber-400/80" style={{ flexGrow: d.saidas }} />
                    <div className="bg-sky-400/80" style={{ flexGrow: d.transferencias }} />
                  </div>
                  <span className="text-[10.5px] text-zinc-600">{d.day}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-4 border-t border-white/[0.06] pt-3 text-[11.5px] text-zinc-500">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-400" /> Entradas</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-400" /> Saídas</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-sky-400" /> Transferências</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, hint, icon, href, alert }: { label: string; value: string; hint: string; icon: React.ReactNode; href: string; alert?: boolean }) {
  return (
    <Link href={href} className="card-hover group rounded-xl border border-white/[0.07] bg-[#141417] p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{label}</p>
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-zinc-400 transition group-hover:text-white">{icon}</span>
      </div>
      <p className="mt-3 text-[30px] font-semibold leading-none tracking-tight text-white">
        {value}
        {alert ? <span className="ml-2 inline-block size-2 rounded-full bg-red-500 align-middle" /> : null}
      </p>
      <p className="mt-2 text-[12.5px] text-zinc-500">{hint}</p>
    </Link>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#141417] px-3.5 py-2 text-[12.5px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white">
      {icon}
      {label}
    </Link>
  );
}

function AlertCard({ tone, kicker, title, desc, href }: { tone: "red" | "yellow" | "gray"; kicker: string; title: string; desc: string; href: string }) {
  const dot = tone === "red" ? "bg-red-500" : tone === "yellow" ? "bg-amber-400" : "bg-zinc-500";
  return (
    <Link href={href} className="card-hover block rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
      <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        <span className={`size-1.5 rounded-full ${dot}`} />
        {kicker}
      </p>
      <p className="mt-1.5 text-[14px] font-semibold text-white">{title}</p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-zinc-500">{desc}</p>
    </Link>
  );
}
