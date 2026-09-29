"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  Tags,
  Warehouse,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Search,
  CornerDownLeft,
  Handshake,
} from "lucide-react";

type Result = {
  id: string;
  kind: "item" | "categoria" | "local" | "movimento" | "empréstimo" | "pagina";
  title: string;
  subtitle: string;
  href: string;
};

const pages: Result[] = [
  { id: "p-dash", kind: "pagina", title: "Dashboard", subtitle: "Visão geral da operação", href: "/" },
  { id: "p-itens", kind: "pagina", title: "Itens", subtitle: "Catálogo de insumos e materiais", href: "/itens" },
  { id: "p-cat", kind: "pagina", title: "Categorias", subtitle: "Grupos operacionais", href: "/categorias" },
  { id: "p-loc", kind: "pagina", title: "Locais de armazenamento", subtitle: "Endereços internos", href: "/locais" },
  { id: "p-ent", kind: "pagina", title: "Entradas", subtitle: "Recebimentos de mercadorias", href: "/entradas" },
  { id: "p-sai", kind: "pagina", title: "Saídas", subtitle: "Consumo e retiradas", href: "/saidas" },
  { id: "p-tra", kind: "pagina", title: "Transferências", subtitle: "Movimentos entre locais", href: "/transferencias" },
  { id: "p-emp", kind: "pagina", title: "Empréstimos", subtitle: "Entre restaurantes · cobrar e devolver", href: "/emprestimos" },
  { id: "p-inv", kind: "pagina", title: "Inventário", subtitle: "Contagens cíclicas", href: "/inventario" },
  { id: "p-ale", kind: "pagina", title: "Alertas", subtitle: "Regras e notificações", href: "/alertas" },
  { id: "p-rel", kind: "pagina", title: "Relatórios", subtitle: "Indicadores gerenciais", href: "/relatorios" },
  { id: "p-dem", kind: "pagina", title: "Central de Demanda", subtitle: "Previsão, calendário e lista de compras", href: "/demanda" },
  { id: "p-com", kind: "pagina", title: "Compras", subtitle: "Pedidos, PDF e recebimento", href: "/compras" },
  { id: "p-usr", kind: "pagina", title: "Usuários", subtitle: "Perfis e permissões (Administrador)", href: "/usuarios" },
];

function iconFor(kind: Result["kind"]) {
  switch (kind) {
    case "item":
      return Package;
    case "categoria":
      return Tags;
    case "local":
      return Warehouse;
    case "movimento":
      return ArrowLeftRight;
    case "empréstimo":
      return Handshake;
    default:
      return Search;
  }
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<Result[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) {
      setQ("");
      setRemote([]);
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      if (q.trim().length < 2) {
        setRemote([]);
        return;
      }
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        setRemote(json.results ?? []);
      } catch {
        setRemote([]);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, open]);

  const results = useMemo(() => {
    const qn = q.trim().toLowerCase();
    const pageHits = qn
      ? pages.filter(
          (p) =>
            p.title.toLowerCase().includes(qn) ||
            p.subtitle.toLowerCase().includes(qn)
        )
      : pages.slice(0, 5);
    const merged = [...remote, ...pageHits];
    const seen = new Set<string>();
    return merged.filter((r) => {
      const k = r.href + r.title;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 12);
  }, [q, remote]);

  useEffect(() => {
    setActive(0);
  }, [results.length]);

  if (!open) return null;

  const go = (r: Result) => {
    onClose();
    router.push(r.href);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 p-4 pt-[10vh] backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="animate-fade-in relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#141417] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4">
          <Search className="size-4 shrink-0 text-zinc-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
              if (e.key === "Enter" && results[active]) go(results[active]);
            }}
            placeholder="Buscar itens, lotes, fornecedor, páginas…"
            className="flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-zinc-600"
          />
          <kbd className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10.5px] font-semibold text-zinc-500">
            ESC
          </kbd>
        </div>
        <div className="max-h-[46vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[13.5px] font-medium text-zinc-400">
                Nenhum resultado
              </p>
              <p className="mt-1 text-[12.5px] text-zinc-600">
                Tente buscar por nome do item, SKU, categoria ou local.
              </p>
            </div>
          ) : (
            results.map((r, i) => {
              const Icon = iconFor(r.kind);
              return (
                <button
                  key={r.id}
                  onClick={() => go(r)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition ${
                    i === active ? "bg-white/[0.07]" : "bg-transparent"
                  }`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-300">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-white">
                      {r.title}
                    </span>
                    <span className="block truncate text-[12px] text-zinc-500">
                      {r.subtitle}
                    </span>
                  </span>
                  <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    {r.kind}
                  </span>
                  {i === active ? (
                    <CornerDownLeft className="size-3.5 text-zinc-500" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-4 border-t border-white/[0.07] bg-white/[0.015] px-5 py-3 text-[11.5px] text-zinc-600">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-white/10 px-1">↑↓</kbd> navegar
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-white/10 px-1">↵</kbd> abrir
          </span>
          <span className="ml-auto hidden items-center gap-1.5 sm:flex">
            <ArrowDownToLine className="size-3" /> Busca global em tempo real
            <ArrowUpFromLine className="size-3" />
            <ArrowLeftRight className="size-3" />
          </span>
        </div>
      </div>
    </div>
  );
}
