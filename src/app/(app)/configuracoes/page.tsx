"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Settings,
  Store,
  Users,
  Bell,
  Database,
  Save,
  Building2,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { PageBadge, Field, inputCls, LoadingRows, Toggle } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useApp } from "@/components/AppContext";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

type S = {
  restaurantName: string;
  document: string | null;
  address: string | null;
  shift: string;
  lowStockNotify: boolean;
  expiryNotify: boolean;
  dailyDigest: boolean;
  expiryDays: number;
  loanNotify: boolean;
  loanDueDays: number;
  demandNotify: boolean;
  demandHorizonDays: number;
  demandAlertDays: number;
  advanceDay: number;
  purchaseDays: string;
  spreadConsumption: boolean;
  inventoryAnchor: boolean;
  priceNotify: boolean;
  priceThreshold: number;
  updatedAt: string;
};

const SHIFTS = ["Turno manhã", "Turno tarde", "Turno noite", "Integral"];
const TABS = [
  { id: "geral", label: "Geral", icon: Store },
  { id: "equipe", label: "Equipe", icon: Users },
  { id: "notificacoes", label: "Notificações e alertas", icon: Bell },
  { id: "sistema", label: "Sistema", icon: Database },
];

export default function ConfiguracoesPage() {
  const { push } = useToast();
  const { refreshOrg, refreshAlerts } = useApp();
  const [tab, setTab] = useState("geral");
  const [form, setForm] = useState<S | null>(null);
  const [saved, setSaved] = useState<S | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ settings: S }>("/api/settings");
    if (r.ok && r.data.settings) {
      setForm(r.data.settings);
      setSaved(r.data.settings);
    } else {
      push({ kind: "error", title: "Não foi possível carregar as configurações", msg: r.error });
    }
  }, [push]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = !!form && JSON.stringify(form) !== JSON.stringify(saved);
  const set = <K extends keyof S>(k: K, v: S[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form || saving) return;
    if (!form.restaurantName.trim()) {
      push({ kind: "error", title: "Informe o nome do restaurante" });
      return;
    }
    const days = Number(form.expiryDays);
    if (!Number.isFinite(days) || days < 1 || days > 60) {
      push({ kind: "error", title: "Janela de vencimento deve ficar entre 1 e 60 dias" });
      return;
    }
    const ld = Number(form.loanDueDays);
    if (!Number.isFinite(ld) || ld < 0 || ld > 30) {
      push({ kind: "error", title: "Antecedência de empréstimos deve ficar entre 0 e 30 dias" });
      return;
    }
    const ah = Number(form.demandAlertDays);
    if (!Number.isFinite(ah) || ah < 3 || ah > 60) {
      push({ kind: "error", title: "Antecedência de demanda deve ficar entre 3 e 60 dias" });
      return;
    }
    const adv = Number(form.advanceDay);
    if (!Number.isFinite(adv) || adv < 1 || adv > 28) {
      push({ kind: "error", title: "Dia do vale deve ficar entre 1 e 28" });
      return;
    }
    const pt = Number(form.priceThreshold);
    if (!Number.isFinite(pt) || pt < 2 || pt > 100) {
      push({ kind: "error", title: "Variação de preço deve ficar entre 2 e 100%" });
      return;
    }
    setSaving(true);
    const r = await api<{ settings: S }>("/api/settings", { method: "PUT", json: form });
    setSaving(false);
    if (r.ok && r.data.settings) {
      setForm(r.data.settings);
      setSaved(r.data.settings);
      push({ kind: "success", title: "Configurações salvas", msg: "Aplicadas em todo o sistema." });
      refreshOrg();
      refreshAlerts();
    } else {
      push({ kind: "error", title: "Não foi possível salvar", msg: r.error });
    }
  };

  return (
    <div className="animate-fade-in">
      <p className="text-[12px] text-zinc-500">
        Sistema <span className="mx-1.5 text-zinc-700">›</span> <span className="text-zinc-300">Configurações</span>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="flex items-center gap-2.5 text-[28px] font-bold tracking-tight text-white">
              <Settings className="size-7 text-zinc-400" /> Configurações
            </h2>
            <PageBadge>Operação</PageBadge>
          </div>
          <p className="mt-1.5 text-[13.5px] text-zinc-400">
            Dados do restaurante, equipe, regras de alerta e parâmetros do sistema.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!dirty && saved ? (
            <span className="hidden items-center gap-1.5 text-[12.5px] text-zinc-500 sm:flex">
              <CheckCircle2 className="size-3.5 text-emerald-400" /> Tudo salvo
            </span>
          ) : null}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2.5 text-[13.5px] font-semibold text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar alterações
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/[0.07] bg-[#141417] p-2 lg:flex-col">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-[13.5px] font-medium transition",
                  tab === t.id ? "bg-white/[0.07] text-white" : "text-zinc-500 hover:text-zinc-200"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-[#141417] p-6">
          {!form ? (
            <LoadingRows label="Carregando configurações…" />
          ) : tab === "geral" ? (
            <div className="space-y-4">
              <SectionTitle icon={<Building2 className="size-4" />} title="Dados do restaurante" desc="Identificação exibida no menu, no topo e nos relatórios." />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nome fantasia" required>
                  <input value={form.restaurantName} maxLength={80} onChange={(e) => set("restaurantName", e.target.value)} className={inputCls} />
                </Field>
                <Field label="CNPJ">
                  <input value={form.document ?? ""} maxLength={30} placeholder="00.000.000/0001-00" onChange={(e) => set("document", e.target.value)} className={inputCls} />
                </Field>
              </div>
              <Field label="Endereço">
                <input value={form.address ?? ""} maxLength={200} placeholder="Rua, número — bairro" onChange={(e) => set("address", e.target.value)} className={inputCls} />
              </Field>
              <div className="max-w-xs">
                <Field label="Turno padrão da operação">
                  <select value={form.shift} onChange={(e) => set("shift", e.target.value)} className={inputCls}>
                    {SHIFTS.map((s) => (
                      <option key={s} className="bg-zinc-900">{s}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          ) : tab === "equipe" ? (
            <div className="space-y-4">
              <SectionTitle icon={<Users className="size-4" />} title="Equipe e perfis" desc="Controle de acesso por função — chega com o login." />
              {[
                { n: "Operador de Estoque", r: `Operador · Sala de estoque · ${form.shift}`, a: true },
                { n: "Cozinha Fria", r: "Consumo · Baixas e requisições", a: true },
                { n: "Gerente", r: "Administrador · Confirmações e estornos", a: false },
              ].map((u) => (
                <div key={u.n} className="flex items-center gap-3.5 rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
                  <span className="grid size-10 place-items-center rounded-full border border-white/10 bg-[#232329] text-[12px] font-bold text-white">
                    {u.n.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-white">{u.n}</p>
                    <p className="text-[12px] text-zinc-500">{u.r}</p>
                  </div>
                  <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${u.a ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.04] text-zinc-500"}`}>
                    {u.a ? "Ativo" : "Convidado"}
                  </span>
                </div>
              ))}
              <p className="rounded-xl border border-dashed border-white/10 p-4 text-[12.5px] text-zinc-500">
                O login com perfis e permissões será implementado em uma próxima etapa. Por enquanto, a operação usa o perfil único de Operador.
              </p>
            </div>
          ) : tab === "notificacoes" ? (
            <div className="space-y-3">
              <SectionTitle icon={<Bell className="size-4" />} title="Notificações e regras de alerta" desc="Estas regras valem para o painel, o sino e a central de alertas." />
              <ToggleRow label="Alertar estoque abaixo do mínimo" desc="Notifica quando o saldo total de um item fica abaixo do mínimo cadastrado" checked={form.lowStockNotify} onChange={(v) => set("lowStockNotify", v)} />
              <ToggleRow label="Alertar validade e vencimentos" desc="Lotes vencidos ou vencendo dentro da janela configurada" checked={form.expiryNotify} onChange={(v) => set("expiryNotify", v)} />
              <ToggleRow label="Resumo diário da operação" desc="Entradas, saídas e alertas do dia por e-mail (envio será ativado em etapa futura)" checked={form.dailyDigest} onChange={(v) => set("dailyDigest", v)} />
              <label className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
                <span className="flex-1">
                  <span className="block text-[13.5px] font-semibold text-white">Janela de vencimento</span>
                  <span className="block text-[12px] text-zinc-500">Dias de antecedência para alertar (1 a 60)</span>
                </span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={form.expiryDays}
                  onChange={(e) => set("expiryDays", Number(e.target.value))}
                  className="w-20 rounded-lg border border-white/[0.08] bg-[#0e0e10] px-3 py-2 text-center text-[13px] text-white outline-none focus:border-white/25"
                />
              </label>
              <ToggleRow label="Alertar prazos de empréstimos" desc="Cobranças a receber e devoluções a fazer, vencidas ou próximas do prazo" checked={form.loanNotify} onChange={(v) => set("loanNotify", v)} />
              <ToggleRow label="Alertar picos de demanda" desc="Feriados, datas comemorativas, pagamentos e rupturas previstas pela Central de Demanda" checked={form.demandNotify} onChange={(v) => set("demandNotify", v)} />
              <label className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
                <span className="flex-1">
                  <span className="block text-[13.5px] font-semibold text-white">Antecedência dos alertas de demanda</span>
                  <span className="block text-[12px] text-zinc-500">Dias antes do pico para começar a avisar (3 a 60)</span>
                </span>
                <input
                  type="number"
                  min={3}
                  max={60}
                  value={form.demandAlertDays}
                  onChange={(e) => set("demandAlertDays", Number(e.target.value))}
                  className="w-20 rounded-lg border border-white/[0.08] bg-[#0e0e10] px-3 py-2 text-center text-[13px] text-white outline-none focus:border-white/25"
                />
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
                <span className="flex-1">
                  <span className="block text-[13.5px] font-semibold text-white">Horizonte da Central de Demanda</span>
                  <span className="block text-[12px] text-zinc-500">Dias projetados no calendário (14 a 120)</span>
                </span>
                <input
                  type="number"
                  min={14}
                  max={120}
                  value={form.demandHorizonDays}
                  onChange={(e) => set("demandHorizonDays", Number(e.target.value))}
                  className="w-20 rounded-lg border border-white/[0.08] bg-[#0e0e10] px-3 py-2 text-center text-[13px] text-white outline-none focus:border-white/25"
                />
              </label>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
                <p className="text-[13.5px] font-semibold text-white">Dias de compra programada</p>
                <p className="mt-0.5 text-[12px] text-zinc-500">Em que dias vocês compram normalmente. A sugestão passa a cobrir até a próxima reposição. Sem marcar nenhum, o sistema deduz do histórico.</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((lbl, dow) => {
                    const sel = (form.purchaseDays || "").split(",").filter(Boolean).map(Number);
                    const on = sel.includes(dow);
                    return (
                      <button
                        key={dow}
                        type="button"
                        onClick={() => {
                          const next = on ? sel.filter((d) => d !== dow) : [...sel, dow].sort((a, b) => a - b);
                          set("purchaseDays", next.join(","));
                        }}
                        className={cn("rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition", on ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-zinc-400 hover:text-white")}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              </div>
              <ToggleRow label="Consumo medido por período" desc="Distribui as baixas lançadas em bloco pelos dias do período, com peso por dia da semana — a casa abre todo dia" checked={form.spreadConsumption} onChange={(v) => set("spreadConsumption", v)} />
              <ToggleRow label="Ancorar previsão no inventário" desc="Usa a diferença entre contagem e sistema para corrigir o consumo que não foi lançado" checked={form.inventoryAnchor} onChange={(v) => set("inventoryAnchor", v)} />
              <ToggleRow label="Alertar alta de preço" desc="Compara o último recebimento com a média do histórico do item e avisa quando subir" checked={form.priceNotify} onChange={(v) => set("priceNotify", v)} />
              <label className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
                <span className="flex-1">
                  <span className="block text-[13.5px] font-semibold text-white">Variação mínima para alertar</span>
                  <span className="block text-[12px] text-zinc-500">Alta de preço sobre a média do item (2 a 100%)</span>
                </span>
                <input
                  type="number"
                  min={2}
                  max={100}
                  value={form.priceThreshold}
                  onChange={(e) => set("priceThreshold", Number(e.target.value))}
                  className="w-20 rounded-lg border border-white/[0.08] bg-[#0e0e10] px-3 py-2 text-center text-[13px] text-white outline-none focus:border-white/25"
                />
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
                <span className="flex-1">
                  <span className="block text-[13.5px] font-semibold text-white">Dia do vale / adiantamento</span>
                  <span className="block text-[12px] text-zinc-500">Dia do mês (cai para o dia útil anterior se preciso). Salário: 5º dia útil.</span>
                </span>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={form.advanceDay}
                  onChange={(e) => set("advanceDay", Number(e.target.value))}
                  className="w-20 rounded-lg border border-white/[0.08] bg-[#0e0e10] px-3 py-2 text-center text-[13px] text-white outline-none focus:border-white/25"
                />
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
                <span className="flex-1">
                  <span className="block text-[13.5px] font-semibold text-white">Antecedência de empréstimos</span>
                  <span className="block text-[12px] text-zinc-500">Dias antes do prazo para começar a avisar (0 a 30)</span>
                </span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={form.loanDueDays}
                  onChange={(e) => set("loanDueDays", Number(e.target.value))}
                  className="w-20 rounded-lg border border-white/[0.08] bg-[#0e0e10] px-3 py-2 text-center text-[13px] text-white outline-none focus:border-white/25"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              <SectionTitle icon={<Database className="size-4" />} title="Sistema e dados" desc="Informações técnicas e manutenção." />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <InfoBox label="Versão" value="v2.2 · base + operação" />
                <InfoBox label="Banco de dados" value="PostgreSQL conectado" ok />
                <InfoBox label="Última alteração" value={saved ? formatDateTime(saved.updatedAt) : "—"} />
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 text-[12.5px] leading-relaxed text-zinc-400">
                <p className="font-semibold text-zinc-200">O que já está ativo</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Entradas, saídas e transferências com rascunho, confirmação e estorno justificado</li>
                  <li>Saldo por local com validação de disponibilidade e trava contra lançamentos duplicados</li>
                  <li>Inventário cíclico e geral com contagem cega e ajuste automático</li>
                  <li>Alertas de mínimo, validade, vencimento e inventário, com silenciar por 24h</li>
                  <li>Relatórios com Curva ABC, perdas por motivo e exportação CSV</li>
                  <li>Empréstimos entre restaurantes com prazo, devolução parcial, acerto e trilha de auditoria</li>
                  <li>Busca global (⌘K) e configurações salvas no banco</li>
                  <li>Central de Demanda com calendário, feriados, folha e lista de compras inteligente</li>
                  <li>Compras com pedido em PDF, envio ao fornecedor e recebimento que vira entrada</li>
                  <li>Consumo medido por período e ancorado no inventário; empréstimos descontados do disponível</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-white/[0.06] pb-4">
      <span className="grid size-9 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-zinc-300">{icon}</span>
      <div>
        <p className="text-[14.5px] font-semibold text-white">{title}</p>
        <p className="text-[12.5px] text-zinc-500">{desc}</p>
      </div>
    </div>
  );
}

function InfoBox({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 flex items-center gap-1.5 text-[14px] font-semibold ${ok ? "text-emerald-300" : "text-white"}`}>
        {ok ? <span className="size-1.5 rounded-full bg-emerald-400" /> : null}
        {value}
      </p>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
      <span className="flex-1">
        <span className="block text-[13.5px] font-semibold text-white">{label}</span>
        <span className="block text-[12px] text-zinc-500">{desc}</span>
      </span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}
