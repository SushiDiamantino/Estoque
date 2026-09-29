"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, ArrowUpDown, ChevronDown, ChevronUp, Download, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import { downloadCsv } from "@/lib/reports/csv";
import { pctFmt } from "@/lib/reports/fmt";
import type { ItemStatus } from "@/lib/reports/types";
import { STATUS_LABEL } from "@/lib/reports/types";

export type RMode = "screen" | "print";

const CLASSES = {
  dark: {
    card: "rounded-xl border border-white/[0.07] bg-[#141417]",
    title: "text-white",
    text: "text-zinc-200",
    strong: "text-white",
    muted: "text-zinc-500",
    subtle: "text-zinc-400",
    border: "border-white/[0.06]",
    divide: "divide-white/[0.05]",
    head: "bg-white/[0.02] text-zinc-500",
    rowHover: "hover:bg-white/[0.02]",
    chip: "border-white/10 bg-white/[0.04] text-zinc-300",
    iconBox: "border-white/[0.07] bg-white/[0.03] text-zinc-400",
    track: "bg-white/[0.06]",
    btn: "border-white/10 text-zinc-400 hover:border-white/20 hover:text-white",
    foot: "bg-white/[0.03] text-white",
  },
  light: {
    card: "rounded-xl border border-zinc-200 bg-white",
    title: "text-zinc-900",
    text: "text-zinc-800",
    strong: "text-zinc-900",
    muted: "text-zinc-500",
    subtle: "text-zinc-600",
    border: "border-zinc-200",
    divide: "divide-zinc-100",
    head: "bg-zinc-50 text-zinc-500",
    rowHover: "",
    chip: "border-zinc-200 bg-zinc-50 text-zinc-700",
    iconBox: "border-zinc-200 bg-zinc-50 text-zinc-500",
    track: "bg-zinc-100",
    btn: "border-zinc-200 text-zinc-500",
    foot: "bg-zinc-50 text-zinc-900",
  },
};

type Ctx = { mode: RMode; theme: "dark" | "light"; c: (typeof CLASSES)["dark"] };
const RCtx = createContext<Ctx>({ mode: "screen", theme: "dark", c: CLASSES.dark });

export function ReportThemeProvider({ mode, children }: { mode: RMode; children: ReactNode }) {
  const theme = mode === "print" ? "light" : "dark";
  return <RCtx.Provider value={{ mode, theme, c: CLASSES[theme] }}>{children}</RCtx.Provider>;
}
export const useRT = () => useContext(RCtx);

export const KPI_GRID = "grid grid-cols-2 gap-3 xl:grid-cols-4 print:grid-cols-4";
export const TWO_COL = "grid grid-cols-1 gap-4 xl:grid-cols-2";

export function Panel({
  title,
  desc,
  icon,
  actions,
  children,
  className,
  avoidBreak = true,
  flush = false,
}: {
  title?: string;
  desc?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  avoidBreak?: boolean;
  flush?: boolean;
}) {
  const { c } = useRT();
  return (
    <section className={cn(c.card, avoidBreak && "break-inside-avoid", "min-w-0", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            {title ? (
              <h3 className={cn("flex items-center gap-2 text-[15px] font-semibold", c.title)}>
                {icon ? <span className={c.muted}>{icon}</span> : null}
                {title}
              </h3>
            ) : null}
            {desc ? <p className={cn("mt-0.5 text-[12.5px]", c.muted)}>{desc}</p> : null}
          </div>
          {actions ? <div className="print:hidden">{actions}</div> : null}
        </div>
      ) : null}
      <div className={flush ? "pt-4" : "p-5"}>{children}</div>
    </section>
  );
}

export function DeltaBadge({ delta, invert, neutral }: { delta: number | null | undefined; invert?: boolean; neutral?: boolean }) {
  if (delta === undefined) return null;
  if (delta === null)
    return <span className="rounded-md border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-sky-500">novo</span>;
  if (Math.abs(delta) < 0.0005)
    return (
      <span className="inline-flex items-center gap-0.5 rounded-md border border-zinc-500/20 bg-zinc-500/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-zinc-500">
        <Minus className="size-3" /> 0%
      </span>
    );
  const up = delta > 0;
  const good = invert ? !up : up;
  const tone = neutral
    ? "border-zinc-500/20 bg-zinc-500/10 text-zinc-500"
    : good
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-500"
      : "border-red-500/25 bg-red-500/10 text-red-500";
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums", tone)}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {pctFmt(Math.abs(delta))}
    </span>
  );
}

export function Metric({
  label,
  value,
  delta,
  invert,
  neutral,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  delta?: number | null;
  invert?: boolean;
  neutral?: boolean;
  hint?: string;
  icon?: ReactNode;
  tone?: "red" | "green" | "amber";
}) {
  const { c } = useRT();
  const valueTone = tone === "red" ? "text-red-500" : tone === "green" ? "text-emerald-500" : tone === "amber" ? "text-amber-500" : c.strong;
  return (
    <div className={cn(c.card, "break-inside-avoid p-4")}>
      <div className="flex items-start justify-between gap-2">
        <p className={cn("text-[12px] font-medium", c.subtle)}>{label}</p>
        {icon ? <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg border print:hidden", c.iconBox)}>{icon}</span> : null}
      </div>
      <p className={cn("mt-2 truncate text-[22px] font-semibold leading-tight tracking-tight tabular-nums", valueTone)} title={value}>{value}</p>
      <div className="mt-1.5 flex min-h-[20px] flex-wrap items-center gap-1.5">
        <DeltaBadge delta={delta} invert={invert} neutral={neutral} />
        {hint ? <span className={cn("text-[11.5px]", c.muted)}>{hint}</span> : null}
      </div>
    </div>
  );
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  const { c } = useRT();
  return <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium", c.chip, className)}>{children}</span>;
}

const STATUS_TONE: Record<ItemStatus, string> = {
  ruptura: "border-red-500/30 bg-red-500/10 text-red-500",
  critico: "border-orange-500/30 bg-orange-500/10 text-orange-500",
  atencao: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  parado: "border-violet-500/30 bg-violet-500/10 text-violet-500",
  sem_giro: "border-zinc-500/25 bg-zinc-500/10 text-zinc-500",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
};
export function StatusTag({ s }: { s: ItemStatus }) {
  return <span className={cn("inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold", STATUS_TONE[s])}>{STATUS_LABEL[s]}</span>;
}

export type Col<T> = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  value: (r: T) => string | number | null;
  render?: (r: T) => ReactNode;
  csv?: boolean;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  initialSort,
  initialDir = "desc",
  exportName,
  limit = 10,
  empty = "Sem dados para os filtros selecionados.",
  footer,
  minWidth = 640,
}: {
  columns: Col<T>[];
  rows: T[];
  initialSort?: string;
  initialDir?: "asc" | "desc";
  exportName?: string;
  limit?: number;
  empty?: string;
  footer?: (string | number | ReactNode)[];
  minWidth?: number;
}) {
  const { c, mode } = useRT();
  const [sort, setSort] = useState<{ key: string | null; dir: "asc" | "desc" }>({ key: initialSort ?? null, dir: initialDir });
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const col = columns.find((cl) => cl.key === sort.key);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const va = col.value(a);
      const vb = col.value(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, columns, sort]);

  const visible = mode === "print" || expanded ? sorted : sorted.slice(0, limit);
  const alignCls = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

  const exportCsv = () => {
    const cols = columns.filter((cl) => cl.csv !== false);
    downloadCsv(
      exportName ?? "relatorio",
      cols.map((cl) => cl.label),
      sorted.map((r) => cols.map((cl) => cl.value(r)))
    );
  };

  return (
    <div>
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full border-collapse text-left text-[12.5px] print:text-[10.5px]" style={{ minWidth: mode === "print" ? undefined : minWidth }}>
          <thead className="print:table-header-group">
            <tr className={cn("border-y text-[10.5px] font-semibold uppercase tracking-[0.05em]", c.border, c.head)}>
              {columns.map((cl) => {
                const active = sort.key === cl.key;
                return (
                  <th key={cl.key} className={cn("whitespace-nowrap px-4 py-2.5 print:px-2 print:py-1.5", alignCls(cl.align))}>
                    {mode === "screen" ? (
                      <button
                        onClick={() => setSort((s) => ({ key: cl.key, dir: s.key === cl.key && s.dir === "desc" ? "asc" : "desc" }))}
                        className={cn("inline-flex items-center gap-1 uppercase transition hover:opacity-100", active ? "opacity-100" : "opacity-80")}
                      >
                        {cl.label}
                        {active ? sort.dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                      </button>
                    ) : (
                      cl.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={cn("divide-y", c.divide)}>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={cn("px-4 py-8 text-center", c.muted)}>{empty}</td>
              </tr>
            ) : (
              visible.map((r, i) => (
                <tr key={i} className={cn("break-inside-avoid transition", c.rowHover)}>
                  {columns.map((cl) => (
                    <td key={cl.key} className={cn("px-4 py-2.5 align-middle tabular-nums print:px-2 print:py-1.5", alignCls(cl.align), c.text, cl.className)}>
                      {cl.render ? cl.render(r) : (cl.value(r) ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {footer && rows.length > 0 ? (
            <tfoot>
              <tr className={cn("border-t font-semibold", c.border, c.foot)}>
                {footer.map((f, i) => (
                  <td key={i} className={cn("px-4 py-2.5 tabular-nums print:px-2 print:py-1.5", alignCls(columns[i]?.align))}>{f}</td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {mode === "screen" && (rows.length > limit || exportName) ? (
        <div className={cn("flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-[12px]", c.border, c.muted)}>
          <span>
            {rows.length === 0 ? "0 registros" : `Mostrando ${visible.length} de ${rows.length}`}
            {rows.length > limit ? (
              <button onClick={() => setExpanded((v) => !v)} className={cn("ml-3 font-medium underline-offset-2 hover:underline", c.subtle)}>
                {expanded ? "Mostrar menos" : "Ver todos"}
              </button>
            ) : null}
          </span>
          {exportName ? (
            <button onClick={exportCsv} disabled={rows.length === 0} className={cn("inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium transition disabled:opacity-40", c.btn)}>
              <Download className="size-3.5" /> CSV
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const { c } = useRT();
  return (
    <div className={cn("h-1.5 w-full min-w-[60px] overflow-hidden rounded-full", c.track)}>
      <div className="h-full rounded-full" style={{ width: `${max > 0 ? Math.min(100, Math.max(2, (value / max) * 100)) : 0}%`, backgroundColor: color }} />
    </div>
  );
}
