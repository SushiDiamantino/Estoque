"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Tags,
  Warehouse,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  ShoppingCart,
  Handshake,
  ClipboardList,
  Sparkles,
  Bell,
  BarChart3,
  Settings,
  Users,
  X,
  LogOut,
} from "lucide-react";
import { useMe } from "@/components/AuthContext";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

const ROLE_SHORT: Record<string, string> = { admin: "Administrador", gerente: "Gerente", operador: "Operador" };

const ALL_GROUPS = [
  {
    label: "Operação",
    links: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/itens", label: "Itens", icon: Package },
      { href: "/categorias", label: "Categorias", icon: Tags },
      { href: "/locais", label: "Locais de armazenamento", icon: Warehouse },
    ],
  },
  {
    label: "Movimentação",
    links: [
      { href: "/compras", label: "Compras", icon: ShoppingCart },
      { href: "/entradas", label: "Entradas", icon: ArrowDownToLine },
      { href: "/saidas", label: "Saídas", icon: ArrowUpFromLine },
      { href: "/transferencias", label: "Transferências", icon: ArrowLeftRight },
      { href: "/emprestimos", label: "Empréstimos", icon: Handshake },
    ],
  },
  {
    label: "Inteligência",
    links: [
      { href: "/demanda", label: "Central de Demanda", icon: Sparkles },
    ],
  },
  {
    label: "Gestão",
    links: [
      { href: "/inventario", label: "Inventário", icon: ClipboardList },
      { href: "/alertas", label: "Alertas", icon: Bell },
      { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
    ],
  },
  {
    label: "Sistema",
    links: [
      { href: "/configuracoes", label: "Configurações", icon: Settings, perm: "configuracoes" },
      { href: "/usuarios", label: "Usuários", icon: Users, perm: "usuarios" },
    ],
  },
];

/** Permissão mínima de cada rota do menu. */
const PERM: Record<string, string> = {
  "/": "dashboard",
  "/itens": "itens",
  "/categorias": "categorias",
  "/locais": "locais",
  "/entradas": "entradas",
  "/saidas": "saidas",
  "/transferencias": "transferencias",
  "/emprestimos": "emprestimos",
  "/compras": "compras",
  "/inventario": "inventario",
  "/alertas": "alertas",
  "/relatorios": "relatorios",
  "/demanda": "demanda",
  "/configuracoes": "configuracoes",
  "/usuarios": "usuarios",
};

export function Sidebar({
  mobileOpen,
  onClose,
  orgName,
  shift,
}: {
  mobileOpen: boolean;
  onClose: () => void;
  orgName: string;
  shift: string;
}) {
  const pathname = usePathname();
  const { me } = useMe();
  const allowed = (href: string) => {
    if (!me) return false;
    const perm = PERM[href];
    if (!perm) return true;
    return me.role === "admin" || me.role === "gerente"
      ? perm !== "usuarios"
      : ["dashboard", "itens", "entradas", "saidas", "transferencias", "alertas", "demanda"].includes(perm);
  };
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };
  const groups = ALL_GROUPS.map((g) => ({ ...g, links: g.links.filter((l) => allowed(l.href)) })).filter((g) => g.links.length > 0);

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-5">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-zinc-100 text-[13px] font-black tracking-tight text-zinc-950">
          {initials(orgName) || "SD"}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold leading-tight text-white" title={orgName}>
            {orgName}
          </p>
          <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-zinc-500">
            Controle de Estoque
          </p>
        </div>
        <button
          onClick={onClose}
          className="ml-auto grid size-8 place-items-center rounded-lg border border-white/10 text-zinc-400 lg:hidden"
          aria-label="Fechar menu"
        >
          <X className="size-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Navegação principal">
        {groups.map((g) => (
          <div key={g.label} className="mb-5">
            <p className="px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
              {g.label}
            </p>
            <div className="space-y-0.5">
              {g.links.map((l) => {
                const active =
                  l.href === "/"
                    ? pathname === "/"
                    : pathname === l.href || pathname.startsWith(l.href + "/");
                const Icon = l.icon;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition",
                      active
                        ? "bg-white/[0.07] text-white"
                        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                    )}
                  >
                    {active ? (
                      <span className="absolute left-0 top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-full bg-white" />
                    ) : null}
                    <Icon className="size-[17px] shrink-0 opacity-90" />
                    <span className="truncate">{l.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.06] px-5 py-4">
        {me ? (
          <>
            <div className="flex items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-[#232329] text-[11px] font-bold text-zinc-200">
                {initials(me.name) || "OP"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-white">{me.name}</p>
                <p className="truncate text-[11.5px] text-zinc-500">{ROLE_SHORT[me.role]} · {me.workArea || shift}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] px-3 py-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
              <p className="flex-1 text-[11.5px] font-medium text-emerald-300">Conectado</p>
              <button onClick={handleLogout} title="Sair do sistema" className="rounded-md p-1 text-emerald-300/80 transition hover:text-white">
                <LogOut className="size-3.5" />
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-white/[0.06] bg-[#101013] lg:block">
        {content}
      </aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <aside className="animate-slide-in absolute inset-y-0 left-0 w-[280px] border-r border-white/10 bg-[#101013]">
            {content}
          </aside>
        </div>
      ) : null}
    </>
  );
}
