"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/Toast";
import { useMe } from "@/components/AuthContext";
import { ROLE_LABEL } from "@/lib/roles";
import { initials } from "@/lib/format";
import Link from "next/link";
import {
  Bell,
  ChevronDown,
  Menu,
  Search,
  Settings,
  ClipboardList,
  ShieldCheck,
  Users,
  LogOut,
  LogIn,
  CheckCheck,
  CheckCircle2,
  ArrowUpRight,
  AlertCircle,
  TriangleAlert,
  Info,
  Loader2,
  type LucideIcon,
} from "lucide-react";

export function Topbar({
  onMenu,
  onSearch,
  alertCount,
  orgName,
  shift,
  onAlertsChanged,
}: {
  onMenu: () => void;
  onSearch: () => void;
  alertCount: number;
  orgName: string;
  shift: string;
  onAlertsChanged?: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [bell, setBell] = useState(false);
  const [alerts, setAlerts] = useState<{ key: string; title: string; message: string; severity: "critico" | "atencao" | "informativo"; href: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [readKeys, setReadKeys] = useState<Set<string>>(new Set());
  const { push } = useToast();
  const { me, logout } = useMe();

  useEffect(() => {
    if (!bell) return;
    let alive = true;
    setLoading(true);
    api<{ alerts: typeof alerts }>("/api/alerts").then((r) => {
      if (!alive) return;
      if (r.ok) setAlerts((r.data.alerts ?? []).slice(0, 30));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [bell]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onSearch();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSearch]);

  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0b0b0d]/90 backdrop-blur-md">
      <div className="flex items-center gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
        <button
          onClick={onMenu}
          className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-300 lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="size-4" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {orgName}
          </p>
          <h1 className="truncate text-[16px] font-bold tracking-tight text-white">
            Controle de Estoque
          </h1>
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          <button
            onClick={onSearch}
            className="hidden items-center gap-2.5 rounded-lg border border-white/[0.08] bg-[#141417] py-2.5 pl-3.5 pr-3 text-[13px] text-zinc-500 transition hover:border-white/15 hover:text-zinc-300 md:flex md:w-[300px]"
          >
            <Search className="size-4 shrink-0" />
            <span className="flex-1 truncate text-left">Buscar itens, lotes, fornecedor…</span>
            <kbd className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10.5px] font-semibold text-zinc-500">
              ⌘ K
            </kbd>
          </button>
          <button
            onClick={onSearch}
            className="grid size-10 place-items-center rounded-lg border border-white/[0.08] bg-[#141417] text-zinc-400 md:hidden"
            aria-label="Buscar"
          >
            <Search className="size-4" />
          </button>

          <div className="relative">
            <button
              onClick={() => setBell((v) => !v)}
              aria-expanded={bell}
              aria-haspopup="dialog"
              aria-label={alertCount > 0 ? `${alertCount} alerta(s) exigem atenção` : "Alertas"}
              title={alertCount > 0 ? `${alertCount} alerta(s) exigem atenção` : "Nenhum alerta pendente"}
              className={cn(
                "relative grid size-10 place-items-center rounded-lg border bg-[#141417] transition",
                bell ? "border-white/25 text-white" : "border-white/[0.08] text-zinc-300 hover:border-white/15"
              )}
            >
              <Bell className="size-[17px]" />
              {alertCount > 0 ? (
                <span className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[9.5px] font-bold text-white ring-2 ring-[#0b0b0d]">
                  {alertCount > 99 ? "99+" : alertCount}
                </span>
              ) : null}
            </button>
            {bell ? (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setBell(false)} aria-hidden />
                <div
                  role="dialog"
                  aria-label="Notificações"
                  className="animate-fade-in absolute right-0 top-full z-20 mt-2 w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-xl border border-white/10 bg-[#141417] shadow-2xl"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-3">
                    <div>
                      <p className="text-[13.5px] font-semibold text-white">Notificações</p>
                      <p className="text-[11.5px] text-zinc-500">
                        {alertCount > 0 ? `${alertCount} exigem atenção` : "Tudo em dia"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={async () => {
                          setClearing(true);
                          const r = await api("/api/alerts/read", { method: "POST", json: {} });
                          setClearing(false);
                          if (r.ok) {
                            push({ kind: "success", title: "Alertas marcados como lidos", msg: "Voltam a aparecer se a condição persistir depois de 12 horas." });
                            setBell(false);
                            onAlertsChanged?.();
                          } else push({ kind: "error", title: "Não foi possível limpar" });
                        }}
                        disabled={alertCount === 0 || clearing}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11.5px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white disabled:opacity-40"
                      >
                        {clearing ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />}
                        Marcar lidos
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[62vh] overflow-y-auto p-2">
                    {loading ? (
                      <div className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-zinc-500">
                        <Loader2 className="size-4 animate-spin" /> Carregando…
                      </div>
                    ) : alerts.length === 0 ? (
                      <div className="px-4 py-10 text-center">
                        <CheckCircle2 className="mx-auto size-8 text-emerald-400" />
                        <p className="mt-3 text-[13px] font-semibold text-white">Nenhum alerta agora</p>
                        <p className="mt-1 text-[12px] text-zinc-500">Estoque, validade, compras e empréstimos em dia.</p>
                      </div>
                    ) : (
                      alerts.map((a) => (
                        <div
                          key={a.key}
                          className={cn(
                            "group flex items-start gap-3 rounded-xl border p-3",
                            a.severity === "critico"
                              ? "border-red-500/20 bg-red-500/[0.06]"
                              : a.severity === "atencao"
                                ? "border-amber-500/20 bg-amber-500/[0.05]"
                                : "border-white/[0.07] bg-white/[0.015]"
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border",
                              a.severity === "critico"
                                ? "border-red-500/25 bg-red-500/10 text-red-300"
                                : a.severity === "atencao"
                                  ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
                                  : "border-white/10 bg-white/[0.04] text-zinc-400"
                            )}
                          >
                            {a.severity === "critico" ? (
                              <AlertCircle className="size-4" />
                            ) : a.severity === "atencao" ? (
                              <TriangleAlert className="size-4" />
                            ) : (
                              <Info className="size-4" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] font-semibold leading-snug text-white">{a.title}</p>
                            <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-zinc-400">{a.message}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {a.href ? (
                                <Link
                                  href={a.href}
                                  onClick={() => setBell(false)}
                                  className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-950 transition hover:bg-white"
                                >
                                  Resolver <ArrowUpRight className="size-3" />
                                </Link>
                              ) : null}
                              <button
                                onClick={async () => {
                                  setReadKeys((p) => new Set(p).add(a.key));
                                  await api("/api/alerts/read", { method: "POST", json: { keys: [a.key], title: a.title, severity: a.severity } });
                                  onAlertsChanged?.();
                                }}
                                disabled={readKeys.has(a.key)}
                                className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] font-medium text-zinc-400 transition hover:text-white disabled:opacity-40"
                              >
                                {readKeys.has(a.key) ? "Lido" : "Marcar como lido"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="border-t border-white/[0.07] bg-white/[0.015] px-4 py-2.5">
                    <Link
                      href="/alertas"
                      onClick={() => setBell(false)}
                      className="flex items-center justify-between text-[12px] font-medium text-zinc-400 transition hover:text-white"
                    >
                      Ver central de alertas <ArrowUpRight className="size-3.5" />
                    </Link>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="relative">
            <button
              onClick={() => setMenu((v) => !v)}
              aria-expanded={menu}
              aria-haspopup="menu"
              className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#141417] py-2 pl-2 pr-2.5 transition hover:border-white/15"
            >
              <span className="grid size-7 place-items-center rounded-md border border-white/10 bg-[#2a2a31] text-[10px] font-bold text-white">
                {me ? initials(me.name) : "OP"}
              </span>
              <span className="hidden max-w-[120px] truncate text-[13.5px] font-semibold text-white sm:inline">{me ? me.name.split(" ")[0] : "Operador"}</span>
              <ChevronDown className={`size-3.5 text-zinc-500 transition ${menu ? "rotate-180" : ""}`} />
            </button>
            {menu ? (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} aria-hidden />
                <div
                  role="menu"
                  className="animate-fade-in absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-white/10 bg-[#141417] p-1.5 shadow-2xl"
                >
                  {me ? (
                    <>
                      <div className="px-3 py-2.5">
                        <p className="text-[13px] font-semibold text-white">{me.name}</p>
                        <p className="truncate text-[11.5px] text-zinc-500">
                          @{me.username} · {ROLE_LABEL[me.role] ?? me.role}
                        </p>
                        <p className="truncate text-[11px] text-zinc-600">{me.workArea ?? orgName}</p>
                      </div>
                      <div className="my-1 h-px bg-white/[0.06]" />
                      {me.role === "admin" ? <MenuLink href="/usuarios" icon={Users} label="Usuários" onClick={() => setMenu(false)} /> : null}
                      <MenuLink href="/configuracoes" icon={Settings} label="Configurações" onClick={() => setMenu(false)} />
                      <MenuLink href="/alertas" icon={Bell} label="Alertas" badge={alertCount} onClick={() => setMenu(false)} />
                      <MenuLink href="/inventario" icon={ClipboardList} label="Inventário" onClick={() => setMenu(false)} />
                      <div className="my-1 h-px bg-white/[0.06]" />
                      <button
                        onClick={async () => {
                          setMenu(false);
                          await logout();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-red-300 transition hover:bg-red-500/10"
                      >
                        <LogOut className="size-4" /> Sair do sistema
                      </button>
                    </>
                  ) : (
                    <Link href="/login" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-zinc-300 hover:bg-white/[0.06]">
                      <LogIn className="size-4" /> Entrar
                    </Link>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
  badge,
  onClick,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      role="menuitem"
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
    >
      <Icon className="size-4 text-zinc-500" />
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-300">{badge}</span>
      ) : null}
    </Link>
  );
}
