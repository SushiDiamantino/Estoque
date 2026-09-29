"use client";

import { useRef, useState, type MouseEvent } from "react";

export type ChartTheme = "dark" | "light";
export const COLORS = {
  purchases: "#34d399",
  consumption: "#fbbf24",
  losses: "#f87171",
  sky: "#38bdf8",
  violet: "#a78bfa",
  zinc: "#a1a1aa",
  pink: "#f472b6",
  teal: "#2dd4bf",
  orange: "#fb923c",
  lime: "#a3e635",
};
export const PALETTE = [COLORS.sky, COLORS.consumption, COLORS.purchases, COLORS.violet, COLORS.pink, COLORS.orange, COLORS.teal, COLORS.losses, COLORS.lime, COLORS.zinc];

const TH = {
  dark: { grid: "rgba(255,255,255,0.07)", text: "#8b8b95", strong: "#e4e4e7", tipBg: "#1b1b20", tipBorder: "rgba(255,255,255,0.12)", tipText: "#f4f4f5", empty: "rgba(255,255,255,0.06)", guide: "rgba(255,255,255,0.25)" },
  light: { grid: "#e4e4e7", text: "#71717a", strong: "#27272a", tipBg: "#ffffff", tipBorder: "#e4e4e7", tipText: "#18181b", empty: "#f4f4f5", guide: "#a1a1aa" },
};

const defaultFmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export function niceMax(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * exp;
}

type Row = { label: string } & Record<string, unknown>;
export type ChartSeries = { key: string; label: string; color: string; area?: boolean; dashed?: boolean; width?: number };

const numAt = (r: Row, k: string): number | null => {
  const v = r[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

export function Legend({ items, theme = "dark" }: { items: { label: string; color: string; dashed?: boolean }[]; theme?: ChartTheme }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px]" style={{ color: TH[theme].text }}>
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.dashed ? (
            <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} />
          ) : (
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ theme, leftPct, title, rows }: { theme: ChartTheme; leftPct: number; title: string; rows: { label: string; value: string; color: string }[] }) {
  const t = TH[theme];
  const shift = leftPct > 65 ? "-100%" : leftPct < 20 ? "0%" : "-50%";
  return (
    <div
      className="pointer-events-none absolute top-1 z-10 min-w-[150px] rounded-lg border px-3 py-2 text-[11.5px] shadow-xl"
      style={{ left: `${leftPct}%`, transform: `translateX(${shift})`, background: t.tipBg, borderColor: t.tipBorder, color: t.tipText }}
    >
      <p className="mb-1 font-semibold">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 opacity-80">
            <span className="size-2 rounded-full" style={{ backgroundColor: r.color }} />
            {r.label}
          </span>
          <span className="font-semibold tabular-nums">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

function useHoverIndex(n: number, W: number, pl: number, iw: number, mode: "point" | "band") {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    if (!ref.current || n === 0) return;
    const rect = ref.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let i = mode === "point" ? (n <= 1 ? 0 : Math.round(((px - pl) / iw) * (n - 1))) : Math.floor(((px - pl) / iw) * n);
    i = Math.max(0, Math.min(n - 1, i));
    setHover(i);
  };
  return { ref, hover, onMove, onLeave: () => setHover(null) };
}

/* ------------------------------------------------------------------ Linha / área */

export function LineChart({
  data,
  series,
  band,
  height = 240,
  theme = "dark",
  format = defaultFmt,
  divider,
  interactive = true,
}: {
  data: Row[];
  series: ChartSeries[];
  band?: { low: string; high: string; color: string; label?: string };
  height?: number;
  theme?: ChartTheme;
  format?: (n: number) => string;
  divider?: { index: number; label: string };
  interactive?: boolean;
}) {
  const W = 800, H = height, pl = 66, pr = 14, pt = 14, pb = 30;
  const iw = W - pl - pr, ih = H - pt - pb;
  const n = data.length;
  const t = TH[theme];
  const vals: number[] = [];
  for (const r of data) {
    for (const s of series) {
      const v = numAt(r, s.key);
      if (v !== null) vals.push(v);
    }
    if (band) {
      const h = numAt(r, band.high);
      if (h !== null) vals.push(h);
    }
  }
  const max = niceMax(Math.max(0, ...vals));
  const x = (i: number) => pl + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => pt + ih - (Math.max(0, v) / max) * ih;
  const step = Math.max(1, Math.ceil(n / 9));
  const { ref, hover, onMove, onLeave } = useHoverIndex(n, W, pl, iw, "point");

  const segments = (key: string) => {
    const out: [number, number][][] = [];
    let cur: [number, number][] = [];
    data.forEach((r, i) => {
      const v = numAt(r, key);
      if (v !== null) cur.push([x(i), y(v)]);
      else if (cur.length) {
        out.push(cur);
        cur = [];
      }
    });
    if (cur.length) out.push(cur);
    return out;
  };
  const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");

  const bandPaths: string[] = [];
  if (band) {
    let run: number[] = [];
    const flush = () => {
      if (run.length > 1) {
        const hi = run.map((i) => [x(i), y(numAt(data[i], band.high) ?? 0)] as [number, number]);
        const lo = run.map((i) => [x(i), y(numAt(data[i], band.low) ?? 0)] as [number, number]).reverse();
        bandPaths.push(`${path(hi)}L${lo.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L")}Z`);
      }
      run = [];
    };
    data.forEach((r, i) => {
      if (numAt(r, band.low) !== null && numAt(r, band.high) !== null) run.push(i);
      else flush();
    });
    flush();
  }

  if (n === 0) return <EmptyChart height={H} theme={theme} />;

  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" onMouseMove={interactive ? onMove : undefined} onMouseLeave={onLeave} role="img">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={pl} x2={W - pr} y1={y(max * f)} y2={y(max * f)} stroke={t.grid} strokeDasharray={f === 0 ? undefined : "3 4"} />
            <text x={pl - 8} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill={t.text}>{format(max * f)}</text>
          </g>
        ))}
        {data.map((r, i) =>
          i % step === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={t.text}>{r.label}</text>
          ) : null
        )}
        {divider && divider.index > 0 && divider.index < n ? (
          <g>
            <line x1={x(divider.index)} x2={x(divider.index)} y1={pt} y2={pt + ih} stroke={t.guide} strokeDasharray="4 4" />
            <text x={x(divider.index) + 6} y={pt + 12} fontSize="11" fill={t.text}>{divider.label}</text>
          </g>
        ) : null}
        {bandPaths.map((d, i) => (
          <path key={i} d={d} fill={band!.color} fillOpacity={0.14} stroke="none" />
        ))}
        {series.map((s) =>
          s.area
            ? segments(s.key).map((pts, i) => (
                <path key={`${s.key}-a${i}`} d={`${path(pts)}L${pts[pts.length - 1][0].toFixed(1)},${pt + ih}L${pts[0][0].toFixed(1)},${pt + ih}Z`} fill={s.color} fillOpacity={0.1} />
              ))
            : null
        )}
        {series.map((s) =>
          segments(s.key).map((pts, i) =>
            pts.length === 1 ? (
              <circle key={`${s.key}-p${i}`} cx={pts[0][0]} cy={pts[0][1]} r={3} fill={s.color} />
            ) : (
              <path key={`${s.key}-l${i}`} d={path(pts)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2.2} strokeDasharray={s.dashed ? "6 5" : undefined} strokeLinejoin="round" strokeLinecap="round" />
            )
          )
        )}
        {hover !== null ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pt} y2={pt + ih} stroke={t.guide} />
            {series.map((s) => {
              const v = numAt(data[hover], s.key);
              return v === null ? null : <circle key={s.key} cx={x(hover)} cy={y(v)} r={4} fill={s.color} stroke={t.tipBg} strokeWidth={2} />;
            })}
          </g>
        ) : null}
      </svg>
      {hover !== null ? (
        <Tooltip
          theme={theme}
          leftPct={(x(hover) / W) * 100}
          title={data[hover].label}
          rows={[
            ...series
              .map((s) => ({ s, v: numAt(data[hover], s.key) }))
              .filter((o) => o.v !== null)
              .map((o) => ({ label: o.s.label, value: format(o.v!), color: o.s.color })),
            ...(band && numAt(data[hover], band.low) !== null
              ? [{ label: band.label ?? "Faixa", value: `${format(numAt(data[hover], band.low)!)} – ${format(numAt(data[hover], band.high)!)}`, color: band.color }]
              : []),
          ]}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Barras */

export function BarChart({
  data,
  series,
  stacked = false,
  height = 240,
  theme = "dark",
  format = defaultFmt,
  interactive = true,
  overlay,
}: {
  data: Row[];
  series: ChartSeries[];
  stacked?: boolean;
  height?: number;
  theme?: ChartTheme;
  format?: (n: number) => string;
  interactive?: boolean;
  overlay?: { key: string; label: string; color: string; max?: number; format?: (n: number) => string };
}) {
  const W = 800, H = height, pl = 66, pr = overlay ? 46 : 14, pt = 14, pb = 30;
  const iw = W - pl - pr, ih = H - pt - pb;
  const n = data.length;
  const t = TH[theme];
  const totals = data.map((r) => (stacked ? series.reduce((s, se) => s + (numAt(r, se.key) ?? 0), 0) : Math.max(0, ...series.map((se) => numAt(r, se.key) ?? 0))));
  const max = niceMax(Math.max(0, ...totals));
  const bw = n ? iw / n : iw;
  const gw = Math.min(bw * 0.72, 64);
  const y = (v: number) => pt + ih - (Math.max(0, v) / max) * ih;
  const step = Math.max(1, Math.ceil(n / 12));
  const oMax = overlay?.max ?? 1;
  const oy = (v: number) => pt + ih - (Math.max(0, Math.min(v, oMax)) / oMax) * ih;
  const ofmt = overlay?.format ?? ((v: number) => `${Math.round(v * 100)}%`);
  const { ref, hover, onMove, onLeave } = useHoverIndex(n, W, pl, iw, "band");

  if (n === 0) return <EmptyChart height={H} theme={theme} />;

  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" onMouseMove={interactive ? onMove : undefined} onMouseLeave={onLeave} role="img">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={pl} x2={W - pr} y1={y(max * f)} y2={y(max * f)} stroke={t.grid} strokeDasharray={f === 0 ? undefined : "3 4"} />
            <text x={pl - 8} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill={t.text}>{format(max * f)}</text>
            {overlay ? (
              <text x={W - pr + 6} y={oy(oMax * f) + 4} fontSize="11" fill={t.text}>{ofmt(oMax * f)}</text>
            ) : null}
          </g>
        ))}
        {hover !== null ? <rect x={pl + hover * bw} y={pt} width={bw} height={ih} fill={t.grid} /> : null}
        {data.map((r, i) => {
          const cx = pl + i * bw + bw / 2;
          if (stacked) {
            let acc = 0;
            return (
              <g key={i}>
                {series.map((s) => {
                  const v = numAt(r, s.key) ?? 0;
                  if (v <= 0) return null;
                  const y1 = y(acc + v);
                  const y0 = y(acc);
                  acc += v;
                  return <rect key={s.key} x={cx - gw / 2} y={y1} width={gw} height={Math.max(0.5, y0 - y1)} fill={s.color} rx={1.5} />;
                })}
              </g>
            );
          }
          const each = gw / series.length;
          return (
            <g key={i}>
              {series.map((s, si) => {
                const v = numAt(r, s.key) ?? 0;
                if (v <= 0) return null;
                return <rect key={s.key} x={cx - gw / 2 + si * each + 0.5} y={y(v)} width={Math.max(1, each - 1)} height={Math.max(0.5, pt + ih - y(v))} fill={s.color} rx={1.5} />;
              })}
            </g>
          );
        })}
        {overlay ? (
          <path
            d={data
              .map((r, i) => `${i ? "L" : "M"}${(pl + i * bw + bw / 2).toFixed(1)},${oy(numAt(r, overlay.key) ?? 0).toFixed(1)}`)
              .join("")}
            fill="none"
            stroke={overlay.color}
            strokeWidth={2.2}
            strokeLinejoin="round"
          />
        ) : null}
        {data.map((r, i) =>
          i % step === 0 || i === n - 1 ? (
            <text key={i} x={pl + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill={t.text}>
              {r.label.length > 14 ? `${r.label.slice(0, 13)}…` : r.label}
            </text>
          ) : null
        )}
      </svg>
      {hover !== null ? (
        <Tooltip
          theme={theme}
          leftPct={((pl + hover * bw + bw / 2) / W) * 100}
          title={data[hover].label}
          rows={[
            ...series.map((s) => ({ label: s.label, value: format(numAt(data[hover], s.key) ?? 0), color: s.color })),
            ...(stacked && series.length > 1 ? [{ label: "Total", value: format(totals[hover]), color: t.guide }] : []),
            ...(overlay ? [{ label: overlay.label, value: ofmt(numAt(data[hover], overlay.key) ?? 0), color: overlay.color }] : []),
          ]}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Rosca */

export function Donut({
  slices,
  theme = "dark",
  format = defaultFmt,
  centerLabel,
  centerValue,
  maxLegend = 7,
}: {
  slices: { label: string; value: number; color: string }[];
  theme?: ChartTheme;
  format?: (n: number) => string;
  centerLabel?: string;
  centerValue?: string;
  maxLegend?: number;
}) {
  const t = TH[theme];
  const sorted = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, maxLegend);
  const rest = sorted.slice(maxLegend).reduce((s, x) => s + x.value, 0);
  const list = rest > 0 ? [...top, { label: "Outros", value: rest, color: COLORS.zinc }] : top;
  const total = list.reduce((s, x) => s + x.value, 0);
  const R = 70, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center print:flex-row">
      <svg viewBox="0 0 200 200" className="size-[170px] shrink-0">
        <circle cx="100" cy="100" r={R} fill="none" stroke={t.empty} strokeWidth="26" />
        {total > 0
          ? list.map((s) => {
              const len = (s.value / total) * C;
              const el = (
                <circle
                  key={s.label}
                  cx="100"
                  cy="100"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="26"
                  strokeDasharray={`${Math.max(0, len - 1.2)} ${C}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 100 100)"
                >
                  <title>{`${s.label}: ${format(s.value)}`}</title>
                </circle>
              );
              offset += len;
              return el;
            })
          : null}
        {centerValue ? (
          <>
            <text x="100" y="98" textAnchor="middle" fontSize="17" fontWeight="700" fill={t.strong}>{centerValue}</text>
            <text x="100" y="118" textAnchor="middle" fontSize="11" fill={t.text}>{centerLabel}</text>
          </>
        ) : null}
      </svg>
      <div className="w-full min-w-0 space-y-2">
        {list.length === 0 ? <p className="text-[12.5px]" style={{ color: t.text }}>Sem dados no período.</p> : null}
        {list.map((s) => (
          <div key={s.label} className="flex items-center gap-2.5 text-[12.5px]">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="min-w-0 flex-1 truncate" style={{ color: t.strong }}>{s.label}</span>
            <span className="shrink-0 tabular-nums" style={{ color: t.text }}>{total > 0 ? `${((s.value / total) * 100).toFixed(1)}%` : "—"}</span>
            <span className="w-[92px] shrink-0 text-right font-semibold tabular-nums" style={{ color: t.strong }}>{format(s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Barras horizontais */

export function HBarList({
  rows,
  theme = "dark",
  format = defaultFmt,
  color = COLORS.sky,
  empty = "Sem dados no período.",
}: {
  rows: { label: string; value: number; sub?: string; color?: string }[];
  theme?: ChartTheme;
  format?: (n: number) => string;
  color?: string;
  empty?: string;
}) {
  const t = TH[theme];
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="py-6 text-center text-[12.5px]" style={{ color: t.text }}>{empty}</p>;
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className="break-inside-avoid">
          <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="min-w-0 truncate font-medium" style={{ color: t.strong }}>{r.label}</span>
            <span className="shrink-0 tabular-nums" style={{ color: t.text }}>
              {r.sub ? <span className="mr-2">{r.sub}</span> : null}
              <span className="font-semibold" style={{ color: t.strong }}>{format(r.value)}</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: t.empty }}>
            <div className="h-full rounded-full" style={{ width: `${max > 0 ? Math.max(2, (r.value / max) * 100) : 0}%`, backgroundColor: r.color ?? color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Mapa de calor */

export function Heatmap({ matrix, theme = "dark", color = COLORS.sky, rowLabels }: { matrix: number[][]; theme?: ChartTheme; color?: string; rowLabels: { index: number; label: string }[] }) {
  const t = TH[theme];
  const max = Math.max(0, ...matrix.flat());
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[36px_repeat(24,minmax(0,1fr))] gap-[3px]">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center text-[9.5px] tabular-nums" style={{ color: t.text }}>{h % 3 === 0 ? `${h}h` : ""}</span>
          ))}
          {rowLabels.map((r) => (
            <div key={r.index} className="contents">
              <span className="pr-1 text-right text-[10.5px] leading-[18px]" style={{ color: t.text }}>{r.label}</span>
              {matrix[r.index].map((v, h) => (
                <span
                  key={h}
                  title={`${r.label} ${h}h: ${v} movimentação(ões)`}
                  className="h-[18px] rounded-[3px]"
                  style={{ backgroundColor: v > 0 ? color : t.empty, opacity: v > 0 ? 0.18 + 0.82 * (v / (max || 1)) : 1 }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-end gap-1.5 text-[10.5px]" style={{ color: t.text }}>
          menos
          {[0.2, 0.4, 0.6, 0.8, 1].map((o) => (
            <span key={o} className="size-3 rounded-[3px]" style={{ backgroundColor: color, opacity: o }} />
          ))}
          mais
        </div>
      </div>
    </div>
  );
}

function EmptyChart({ height, theme }: { height: number; theme: ChartTheme }) {
  return (
    <div className="grid place-items-center rounded-lg border border-dashed text-[12.5px]" style={{ height: height * 0.6, borderColor: TH[theme].grid, color: TH[theme].text }}>
      Sem dados no período.
    </div>
  );
}
