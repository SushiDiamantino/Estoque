"use client";

import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Handshake,
  Info,
  Layers,
  PackageX,
  Percent,
  Repeat,
  Scale,
  ShoppingCart,
  Sigma,
  Target,
  Timer,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import { BarChart, COLORS, Donut, Heatmap, HBarList, Legend, LineChart, PALETTE } from "@/components/charts";
import { Bar, Chip, DataTable, DeltaBadge, KPI_GRID, Metric, Panel, StatusTag, TWO_COL, useRT } from "./kit";
import { BUCKET_NAME, daysFmt, dec, int, money, moneyShort, pctChange, pctFmt, qty, signedPct } from "@/lib/reports/fmt";
import { fmtDay, fmtDayShort, WEEKDAYS } from "@/lib/reports/dates";
import { CLS_LABEL, type ItemMetric, type ItemStatus, type ReportData, type SectionId } from "@/lib/reports/types";
import { cn } from "@/lib/cn";

type P = { d: ReportData };
const ic = "size-4";
const STATUS_COLOR: Record<ItemStatus, string> = {
  ruptura: COLORS.losses,
  critico: COLORS.orange,
  atencao: COLORS.consumption,
  parado: COLORS.violet,
  sem_giro: COLORS.zinc,
  ok: COLORS.purchases,
};
const ROW_ORDER = [1, 2, 3, 4, 5, 6, 0].map((i) => ({ index: i, label: WEEKDAYS[i] }));

function Name({ title, sub }: { title: string; sub?: string | null }) {
  const { c } = useRT();
  return (
    <div className="min-w-0 max-w-[260px]">
      <p className={cn("truncate font-medium", c.strong)} title={title}>{title}</p>
      {sub ? <p className={cn("truncate font-mono text-[10.5px]", c.muted)}>{sub}</p> : null}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  const { c } = useRT();
  return <p className={cn("text-[11.5px] leading-relaxed", c.muted)}>{children}</p>;
}

export function InsightsList({ d }: P) {
  const { c } = useRT();
  const tone = {
    bad: { icon: <AlertTriangle className={ic} />, cls: "border-red-500/25 bg-red-500/[0.06] text-red-500" },
    warn: { icon: <AlertTriangle className={ic} />, cls: "border-amber-500/25 bg-amber-500/[0.06] text-amber-500" },
    good: { icon: <CheckCircle2 className={ic} />, cls: "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-500" },
    info: { icon: <Info className={ic} />, cls: "border-sky-500/25 bg-sky-500/[0.06] text-sky-500" },
  };
  return (
    <div className="space-y-2.5">
      {d.insights.map((i, idx) => (
        <div key={idx} className={cn("flex items-start gap-3 rounded-xl border p-3.5 break-inside-avoid", tone[i.tone].cls)}>
          <span className="mt-0.5 shrink-0">{tone[i.tone].icon}</span>
          <div className="min-w-0">
            <p className={cn("text-[13px] font-semibold", c.strong)}>{i.title}</p>
            <p className={cn("mt-0.5 text-[12px] leading-relaxed", c.subtle)}>{i.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================================================================ Visão geral */

export function OverviewSection({ d }: P) {
  const { theme, mode } = useRT();
  const k = d.kpis;
  const p = d.prev;
  const bn = BUCKET_NAME[d.filters.bucket];
  const catSlices = d.categories.filter((x) => x.consumption > 0).map((x, i) => ({ label: x.name, value: x.consumption, color: x.color || PALETTE[i % PALETTE.length] }));
  type Cmp = { label: string; cur: number; prev: number; fmt: (n: number) => string; invert?: boolean; neutral?: boolean; pp?: boolean };
  const compare: Cmp[] = [
    { label: "Compras", cur: k.purchases, prev: p.purchases, fmt: money, neutral: true },
    { label: "Consumo", cur: k.consumption, prev: p.consumption, fmt: money, invert: true },
    { label: "Perdas", cur: k.losses, prev: p.losses, fmt: money, invert: true },
    { label: "Taxa de perda", cur: k.lossRate, prev: p.lossRate, fmt: (n) => pctFmt(n), invert: true, pp: true },
    { label: "Consumo médio diário", cur: k.avgDailyConsumption, prev: p.avgDailyConsumption, fmt: money, invert: true },
    { label: "Ticket médio de compra", cur: k.avgTicket, prev: p.avgTicket, fmt: money, neutral: true },
    { label: "Ajustes de inventário (líquido)", cur: k.adjustNet, prev: p.adjustNet, fmt: money, neutral: true },
    { label: "Itens consumidos", cur: k.itemsConsumed, prev: p.itemsConsumed, fmt: int, neutral: true },
    { label: "Movimentações", cur: k.movementsCount, prev: p.movementsCount, fmt: int, neutral: true },
  ];

  return (
    <div className="space-y-4">
      <div className={KPI_GRID}>
        <Metric label="Compras" value={money(k.purchases)} delta={pctChange(k.purchases, p.purchases)} neutral hint={`${k.purchasesCount} recebimento(s)`} icon={<ArrowDownToLine className={ic} />} />
        <Metric label="Consumo" value={money(k.consumption)} delta={pctChange(k.consumption, p.consumption)} invert hint={`${money(k.avgDailyConsumption)}/dia`} icon={<ArrowUpFromLine className={ic} />} />
        <Metric label="Perdas" value={money(k.losses)} delta={pctChange(k.losses, p.losses)} invert hint={`taxa de ${pctFmt(k.lossRate)}`} tone={k.lossRate >= 0.05 ? "red" : undefined} icon={<PackageX className={ic} />} />
        <Metric label="Valor em estoque" value={money(d.stock.value)} hint={`${d.stock.withStock} de ${d.stock.items} itens com saldo`} icon={<Wallet className={ic} />} />
        <Metric label="Giro anualizado" value={d.stock.turnoverAnnual === null ? "—" : `${dec(d.stock.turnoverAnnual)}x`} hint="saídas ÷ valor em estoque" icon={<Repeat className={ic} />} />
        <Metric label="Cobertura (DIO)" value={daysFmt(d.stock.dio)} hint="dias que o estoque dura" icon={<Timer className={ic} />} />
        <Metric label="Rupturas" value={int(d.stock.ruptures)} hint={`${d.stock.belowMin} abaixo do mínimo`} tone={d.stock.ruptures > 0 ? "red" : "green"} icon={<AlertTriangle className={ic} />} />
        <Metric label="Movimentações" value={int(k.movementsCount)} delta={pctChange(k.movementsCount, p.movementsCount)} neutral hint={`${k.entradasCount} ent. · ${k.saidasCount} saí. · ${k.transfersCount} transf.`} icon={<Activity className={ic} />} />
      </div>

      <Panel title="Evolução financeira" desc={`Compras, consumo e perdas por ${bn}`} icon={<TrendingUp className={ic} />}>
        <LineChart
          data={d.series}
          theme={theme}
          interactive={mode === "screen"}
          format={moneyShort}
          series={[
            { key: "purchases", label: "Compras", color: COLORS.purchases, area: true },
            { key: "consumption", label: "Consumo", color: COLORS.consumption, area: true },
            { key: "losses", label: "Perdas", color: COLORS.losses },
          ]}
        />
        <Legend theme={theme} items={[{ label: "Compras", color: COLORS.purchases }, { label: "Consumo", color: COLORS.consumption }, { label: "Perdas", color: COLORS.losses }]} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Panel title="Destaques automáticos" desc="Leitura do período com base nos dados — o que merece atenção" icon={<Sigma className={ic} />}>
          <InsightsList d={d} />
        </Panel>
        <Panel title="Consumo por categoria" desc="Participação no valor consumido" icon={<Layers className={ic} />}>
          <Donut slices={catSlices} theme={theme} format={money} centerValue={moneyShort(k.consumption)} centerLabel="consumido" />
        </Panel>
      </div>

      <Panel title="Comparativo com o período anterior" desc={`${fmtDay(d.filters.from)}–${fmtDay(d.filters.to)} contra ${fmtDay(d.filters.prevFrom)}–${fmtDay(d.filters.prevTo)}`} icon={<Scale className={ic} />} flush avoidBreak={false}>
        <DataTable<Cmp>
          rows={compare}
          limit={20}
          exportName="comparativo-periodos"
          columns={[
            { key: "label", label: "Indicador", value: (r) => r.label, render: (r) => <span className="font-medium">{r.label}</span> },
            { key: "cur", label: "Período atual", align: "right", value: (r) => r.cur, render: (r) => r.fmt(r.cur) },
            { key: "prev", label: "Período anterior", align: "right", value: (r) => r.prev, render: (r) => r.fmt(r.prev) },
            { key: "diff", label: "Diferença", align: "right", value: (r) => r.cur - r.prev, render: (r) => (r.pp ? `${dec((r.cur - r.prev) * 100)} p.p.` : r.fmt(r.cur - r.prev)) },
            { key: "var", label: "Variação", align: "right", value: (r) => (r.pp ? null : pctChange(r.cur, r.prev)), render: (r) => (r.pp ? "—" : <DeltaBadge delta={pctChange(r.cur, r.prev)} invert={r.invert} neutral={r.neutral} />) },
          ]}
        />
      </Panel>
    </div>
  );
}

/* ================================================================ Consumo */

export function ConsumoSection({ d }: P) {
  const { theme, mode } = useRT();
  const k = d.kpis;
  const p = d.prev;
  const a = d.abc.filter((r) => r.cls === "A");
  const aShare = a.reduce((s, r) => s + r.share, 0);
  const totalCons = d.categories.reduce((s, c) => s + c.consumption, 0);
  return (
    <div className="space-y-4">
      <div className={KPI_GRID}>
        <Metric label="Consumo no período" value={money(k.consumption)} delta={pctChange(k.consumption, p.consumption)} invert hint="cozinha, delivery e uso" icon={<ArrowUpFromLine className={ic} />} />
        <Metric label="Média diária" value={money(k.avgDailyConsumption)} delta={pctChange(k.avgDailyConsumption, p.avgDailyConsumption)} invert hint={`${d.filters.days} dia(s)`} icon={<Gauge className={ic} />} />
        <Metric label="Itens consumidos" value={int(k.itemsConsumed)} delta={pctChange(k.itemsConsumed, p.itemsConsumed)} neutral hint="SKUs distintos" icon={<Boxes className={ic} />} />
        <Metric label="Concentração (classe A)" value={`${a.length} ${a.length === 1 ? "item" : "itens"}`} hint={`${pctFmt(aShare)} do valor das saídas`} icon={<Target className={ic} />} />
      </div>

      <Panel title="Consumo e perdas por período" desc={`Valor das saídas operacionais por ${BUCKET_NAME[d.filters.bucket]}`} icon={<Activity className={ic} />}>
        <BarChart data={d.series} stacked theme={theme} interactive={mode === "screen"} format={moneyShort} series={[{ key: "consumption", label: "Consumo", color: COLORS.consumption }, { key: "losses", label: "Perdas", color: COLORS.losses }]} />
        <Legend theme={theme} items={[{ label: "Consumo", color: COLORS.consumption }, { label: "Perdas", color: COLORS.losses }]} />
      </Panel>

      <div className={TWO_COL}>
        <Panel title="Curva ABC" desc={`Top 15 por ${d.abc.some((r) => r.value > 0) ? "valor" : "quantidade"} · linha = % acumulado`} icon={<Target className={ic} />}>
          <BarChart
            data={d.abc.slice(0, 15).map((r) => ({ label: r.name, value: r.value, cum: r.cumShare }))}
            theme={theme}
            interactive={mode === "screen"}
            format={moneyShort}
            series={[{ key: "value", label: "Valor", color: COLORS.sky }]}
            overlay={{ key: "cum", label: "% acumulado", color: COLORS.consumption, max: 1 }}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {(["A", "B", "C"] as const).map((cl) => {
              const rows = d.abc.filter((r) => r.cls === cl);
              return <Chip key={cl}>Classe {cl}: {rows.length} itens · {pctFmt(rows.reduce((s, r) => s + r.share, 0))}</Chip>;
            })}
          </div>
        </Panel>
        <Panel title="Consumo médio por dia da semana" desc="Valor médio consumido em cada dia — base para escala e pedidos" icon={<CalendarClock className={ic} />}>
          <BarChart data={d.weekday.map((w) => ({ label: w.label, avg: w.avg }))} theme={theme} interactive={mode === "screen"} format={moneyShort} series={[{ key: "avg", label: "Média do dia", color: COLORS.violet }]} />
        </Panel>
      </div>

      <Panel title="Curva ABC — detalhamento" desc="A ≈ 80% do valor · B ≈ 15% · C ≈ 5%" flush avoidBreak={false}>
        <DataTable
          rows={d.abc}
          exportName="curva-abc"
          initialSort="value"
          columns={[
            { key: "cls", label: "Classe", value: (r) => r.cls, render: (r) => <Chip className={r.cls === "A" ? "text-emerald-500" : r.cls === "B" ? "text-sky-500" : ""}>{r.cls}</Chip> },
            { key: "name", label: "Item", value: (r) => r.name, render: (r) => <Name title={r.name} sub={r.sku} /> },
            { key: "qty", label: "Quantidade", align: "right", value: (r) => r.qty, render: (r) => `${qty(r.qty)} ${r.unit}` },
            { key: "value", label: "Valor", align: "right", value: (r) => r.value, render: (r) => money(r.value) },
            { key: "share", label: "Participação", align: "right", value: (r) => r.share, render: (r) => pctFmt(r.share) },
            { key: "cum", label: "Acumulado", align: "right", value: (r) => r.cumShare, render: (r) => pctFmt(r.cumShare) },
          ]}
        />
      </Panel>

      <Panel title="Categorias" desc="Consumo, perdas, compras e estoque por grupo" flush avoidBreak={false}>
        <DataTable
          rows={d.categories}
          exportName="categorias"
          initialSort="consumption"
          footer={["Total", money(totalCons), money(d.categories.reduce((s, c) => s + c.losses, 0)), money(d.categories.reduce((s, c) => s + c.purchases, 0)), "100%", money(d.categories.reduce((s, c) => s + c.stockValue, 0)), int(d.categories.reduce((s, c) => s + c.items, 0))]}
          columns={[
            { key: "name", label: "Categoria", value: (r) => r.name, render: (r) => <span className="inline-flex items-center gap-2 font-medium"><span className="size-2.5 rounded-sm" style={{ backgroundColor: r.color }} />{r.name}</span> },
            { key: "consumption", label: "Consumo", align: "right", value: (r) => r.consumption, render: (r) => money(r.consumption) },
            { key: "losses", label: "Perdas", align: "right", value: (r) => r.losses, render: (r) => money(r.losses) },
            { key: "purchases", label: "Compras", align: "right", value: (r) => r.purchases, render: (r) => money(r.purchases) },
            { key: "share", label: "% consumo", align: "right", value: (r) => (totalCons > 0 ? r.consumption / totalCons : 0), render: (r) => pctFmt(totalCons > 0 ? r.consumption / totalCons : 0) },
            { key: "stock", label: "Estoque (R$)", align: "right", value: (r) => r.stockValue, render: (r) => money(r.stockValue) },
            { key: "items", label: "Itens", align: "right", value: (r) => r.items },
          ]}
        />
      </Panel>
    </div>
  );
}

/* ================================================================ Estoque */

export function EstoqueSection({ d }: P) {
  const { theme } = useRT();
  const s = d.stock;
  const statusCounts = (Object.keys(STATUS_COLOR) as ItemStatus[]).map((st) => ({ st, n: d.items.filter((i) => i.status === st).length }));
  const stagnant = d.items.filter((i) => i.status === "parado");
  const maxCov = Math.max(d.filters.targetDays * 2, 1);
  return (
    <div className="space-y-4">
      <div className={KPI_GRID}>
        <Metric label="Valor em estoque" value={money(s.value)} hint={`${qty(s.qty)} un. em saldo`} icon={<Wallet className={ic} />} />
        <Metric label="Itens com saldo" value={`${s.withStock} / ${s.items}`} hint="ativos com quantidade > 0" icon={<Boxes className={ic} />} />
        <Metric label="Abaixo do mínimo" value={int(s.belowMin)} tone={s.belowMin > 0 ? "amber" : "green"} hint="precisam de reposição" icon={<AlertTriangle className={ic} />} />
        <Metric label="Rupturas" value={int(s.ruptures)} tone={s.ruptures > 0 ? "red" : "green"} hint="sem saldo e com demanda" icon={<PackageX className={ic} />} />
        <Metric label="Estoque parado" value={money(s.stagnantValue)} hint={`${s.stagnantCount} item(ns) sem saída`} tone={s.value > 0 && s.stagnantValue / s.value >= 0.15 ? "amber" : undefined} icon={<Timer className={ic} />} />
        <Metric label="Giro no período" value={s.turnover === null ? "—" : `${dec(s.turnover, 2)}x`} hint={s.turnoverAnnual === null ? "sem estoque" : `${dec(s.turnoverAnnual)}x ao ano`} icon={<Repeat className={ic} />} />
        <Metric label="Cobertura média" value={daysFmt(s.dio)} hint="valor em estoque ÷ saída diária" icon={<Gauge className={ic} />} />
        <Metric label="Meta de cobertura" value={`${d.filters.targetDays} dias`} hint="usada nas sugestões de compra" icon={<Target className={ic} />} />
      </div>

      <div className={TWO_COL}>
        <Panel title="Valor por local" desc="Quantidade × custo médio" icon={<Truck className={ic} />}>
          <HBarList theme={theme} format={money} rows={d.locations.map((l) => ({ label: l.name, value: l.stockValue, sub: `${l.skus} SKU(s)` }))} />
        </Panel>
        <Panel title="Valor por categoria" icon={<Layers className={ic} />}>
          <Donut theme={theme} format={money} centerValue={moneyShort(s.value)} centerLabel="em estoque" slices={d.categories.filter((c) => c.stockValue > 0).map((c, i) => ({ label: c.name, value: c.stockValue, color: c.color || PALETTE[i % PALETTE.length] }))} />
        </Panel>
      </div>

      <Panel title="Saúde do estoque" desc="Classificação de cada item pelo saldo, mínimo e ritmo de consumo" icon={<Activity className={ic} />}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6 print:grid-cols-6">
          {statusCounts.map(({ st, n }) => (
            <div key={st} className="rounded-lg border p-3" style={{ borderColor: `${STATUS_COLOR[st]}55`, background: `${STATUS_COLOR[st]}12` }}>
              <p className="text-[20px] font-semibold tabular-nums" style={{ color: STATUS_COLOR[st] }}>{n}</p>
              <StatusTag s={st} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Posição e cobertura por item" desc="Cobertura = saldo ÷ consumo médio diário do período · ruptura prevista assume o mesmo ritmo" flush avoidBreak={false}>
        <DataTable<ItemMetric>
          rows={d.items}
          exportName="posicao-estoque"
          initialSort="coverage"
          initialDir="asc"
          limit={15}
          minWidth={900}
          columns={[
            { key: "name", label: "Item", value: (r) => r.name, render: (r) => <Name title={r.name} sub={r.sku} /> },
            { key: "category", label: "Categoria", value: (r) => r.category },
            { key: "stock", label: "Saldo", align: "right", value: (r) => r.stock, render: (r) => `${qty(r.stock)} ${r.unit}` },
            { key: "min", label: "Mínimo", align: "right", value: (r) => r.min, render: (r) => (r.min > 0 ? qty(r.min) : "—") },
            { key: "avg", label: "Saída/dia", align: "right", value: (r) => r.avgDaily, render: (r) => (r.avgDaily > 0 ? qty(Math.round(r.avgDaily * 1000) / 1000) : "—") },
            {
              key: "coverage",
              label: "Cobertura",
              value: (r) => r.coverageDays,
              render: (r) => (
                <div className="flex min-w-[130px] items-center gap-2">
                  <Bar value={r.coverageDays ?? 0} max={maxCov} color={STATUS_COLOR[r.status]} />
                  <span className="w-16 shrink-0 text-right">{daysFmt(r.coverageDays)}</span>
                </div>
              ),
            },
            { key: "rupture", label: "Acaba em", align: "right", value: (r) => r.ruptureDate, render: (r) => (r.status === "ruptura" ? "já zerado" : fmtDay(r.ruptureDate)) },
            { key: "value", label: "Valor", align: "right", value: (r) => r.stockValue, render: (r) => money(r.stockValue) },
            { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusTag s={r.status} /> },
          ]}
        />
      </Panel>

      <Panel title="Estoque parado" desc="Itens com saldo e nenhuma saída no período — capital imobilizado" flush avoidBreak={false}>
        <DataTable<ItemMetric>
          rows={stagnant}
          exportName="estoque-parado"
          initialSort="value"
          empty="Nenhum item parado no período."
          footer={["Total", "", money(stagnant.reduce((a, r) => a + r.stockValue, 0)), ""]}
          columns={[
            { key: "name", label: "Item", value: (r) => r.name, render: (r) => <Name title={r.name} sub={r.sku} /> },
            { key: "stock", label: "Saldo", align: "right", value: (r) => r.stock, render: (r) => `${qty(r.stock)} ${r.unit}` },
            { key: "value", label: "Valor imobilizado", align: "right", value: (r) => r.stockValue, render: (r) => money(r.stockValue) },
            { key: "last", label: "Última movimentação", align: "right", value: (r) => r.lastMove, render: (r) => fmtDay(r.lastMove) },
          ]}
        />
      </Panel>
    </div>
  );
}

/* ================================================================ Compras */

export function ComprasSection({ d }: P) {
  const { theme, mode } = useRT();
  const k = d.kpis;
  const p = d.prev;
  const priced = d.items.filter((i) => i.price);
  return (
    <div className="space-y-4">
      <div className={KPI_GRID}>
        <Metric label="Total comprado" value={money(k.purchases)} delta={pctChange(k.purchases, p.purchases)} neutral hint={`${qty(k.purchasesQty)} un. recebidas`} icon={<ShoppingCart className={ic} />} />
        <Metric label="Recebimentos" value={int(k.purchasesCount)} delta={pctChange(k.purchasesCount, p.purchasesCount)} neutral hint="entradas confirmadas" icon={<ArrowDownToLine className={ic} />} />
        <Metric label="Ticket médio" value={money(k.avgTicket)} delta={pctChange(k.avgTicket, p.avgTicket)} neutral hint="por recebimento" icon={<Scale className={ic} />} />
        <Metric label="Fornecedores" value={int(d.suppliers.length)} hint={d.suppliers[0] ? `maior: ${d.suppliers[0].name.slice(0, 22)}` : "sem compras"} icon={<Truck className={ic} />} />
      </div>
      <div className={TWO_COL}>
        <Panel title="Compras por período" desc={`Valor recebido por ${BUCKET_NAME[d.filters.bucket]}`} icon={<ShoppingCart className={ic} />}>
          <BarChart data={d.series} theme={theme} interactive={mode === "screen"} format={moneyShort} series={[{ key: "purchases", label: "Compras", color: COLORS.purchases }]} />
        </Panel>
        <Panel title="Principais fornecedores" desc="Participação no valor comprado" icon={<Truck className={ic} />}>
          <HBarList theme={theme} format={money} color={COLORS.purchases} rows={d.suppliers.slice(0, 8).map((s) => ({ label: s.name, value: s.value, sub: pctFmt(s.share) }))} />
        </Panel>
      </div>
      <Panel title="Fornecedores" flush avoidBreak={false}>
        <DataTable
          rows={d.suppliers}
          exportName="fornecedores"
          initialSort="value"
          footer={["Total", money(k.purchases), "100%", int(k.purchasesCount), money(k.avgTicket), "", ""]}
          columns={[
            { key: "name", label: "Fornecedor", value: (r) => r.name, render: (r) => <span className="font-medium">{r.name}</span> },
            { key: "value", label: "Valor", align: "right", value: (r) => r.value, render: (r) => money(r.value) },
            { key: "share", label: "Participação", align: "right", value: (r) => r.share, render: (r) => pctFmt(r.share) },
            { key: "movements", label: "Recebimentos", align: "right", value: (r) => r.movements },
            { key: "ticket", label: "Ticket médio", align: "right", value: (r) => r.avgTicket, render: (r) => money(r.avgTicket) },
            { key: "items", label: "Itens", align: "right", value: (r) => r.items },
            { key: "last", label: "Última compra", align: "right", value: (r) => r.lastDate, render: (r) => fmtDay(r.lastDate) },
          ]}
        />
      </Panel>
      <Panel title="Variação de custo por item" desc="Custo unitário informado nas entradas do período · variação = último ÷ primeiro" flush avoidBreak={false}>
        <DataTable<ItemMetric>
          rows={priced}
          exportName="variacao-custo"
          initialSort="var"
          empty="Nenhuma entrada com custo informado no período."
          minWidth={820}
          columns={[
            { key: "name", label: "Item", value: (r) => r.name, render: (r) => <Name title={r.name} sub={`${r.sku} · ${r.unit}`} /> },
            { key: "buys", label: "Compras", align: "right", value: (r) => r.price?.buys ?? 0 },
            { key: "first", label: "Primeiro", align: "right", value: (r) => r.price?.first ?? null, render: (r) => money(r.price?.first) },
            { key: "last", label: "Último", align: "right", value: (r) => r.price?.last ?? null, render: (r) => money(r.price?.last) },
            { key: "min", label: "Mínimo", align: "right", value: (r) => r.price?.min ?? null, render: (r) => money(r.price?.min) },
            { key: "max", label: "Máximo", align: "right", value: (r) => r.price?.max ?? null, render: (r) => money(r.price?.max) },
            { key: "avg", label: "Médio pond.", align: "right", value: (r) => r.price?.avg ?? null, render: (r) => money(r.price?.avg) },
            {
              key: "var",
              label: "Variação",
              align: "right",
              value: (r) => r.price?.variation ?? null,
              render: (r) => {
                const v = r.price?.variation;
                return v === null || v === undefined ? "—" : <span className={cn("font-semibold", v > 0.001 ? "text-red-500" : v < -0.001 ? "text-emerald-500" : "")}>{signedPct(v)}</span>;
              },
            },
          ]}
        />
      </Panel>
    </div>
  );
}

/* ================================================================ Perdas & validade */

export function PerdasSection({ d }: P) {
  const { theme, mode } = useRT();
  const k = d.kpis;
  const p = d.prev;
  const baixas = d.losses.byReason.reduce((s, r) => s + r.count, 0);
  const exp = d.expiry.buckets;
  const within30 = exp.slice(1, 4).reduce((s, b) => s + b.value, 0);
  const toneColor = { bad: COLORS.losses, warn: COLORS.consumption, info: COLORS.sky };
  return (
    <div className="space-y-4">
      <div className={KPI_GRID}>
        <Metric label="Perdas no período" value={money(k.losses)} delta={pctChange(k.losses, p.losses)} invert tone={k.losses > 0 ? "red" : "green"} icon={<PackageX className={ic} />} />
        <Metric label="Taxa de perda" value={pctFmt(k.lossRate)} hint={`${(k.lossRate - p.lossRate) >= 0 ? "+" : ""}${dec((k.lossRate - p.lossRate) * 100)} p.p. vs anterior`} tone={k.lossRate >= 0.05 ? "red" : undefined} icon={<Percent className={ic} />} />
        <Metric label="Lotes vencidos com saldo" value={money(exp[0].value)} hint={`${exp[0].count} lote(s)`} tone={exp[0].count > 0 ? "red" : "green"} icon={<AlertTriangle className={ic} />} />
        <Metric label="Vencendo em 30 dias" value={money(within30)} hint={`${exp.slice(1, 4).reduce((s, b) => s + b.count, 0)} lote(s) · ${baixas} baixa(s) no período`} tone={within30 > 0 ? "amber" : undefined} icon={<CalendarClock className={ic} />} />
      </div>
      <div className={TWO_COL}>
        <Panel title="Perdas por motivo" icon={<PackageX className={ic} />}>
          <Donut theme={theme} format={money} centerValue={moneyShort(k.losses)} centerLabel="perdido" slices={d.losses.byReason.map((r, i) => ({ label: `${r.reason} (${r.count})`, value: r.value, color: [COLORS.losses, COLORS.orange, COLORS.pink, COLORS.violet][i % 4] }))} />
        </Panel>
        <Panel title="Perdas por período" desc={`Valor baixado por ${BUCKET_NAME[d.filters.bucket]}`} icon={<Activity className={ic} />}>
          <BarChart data={d.series} theme={theme} interactive={mode === "screen"} format={moneyShort} series={[{ key: "losses", label: "Perdas", color: COLORS.losses }]} />
        </Panel>
      </div>
      <Panel title="Itens com maior perda" flush avoidBreak={false}>
        <DataTable
          rows={d.losses.topItems}
          exportName="perdas-por-item"
          initialSort="value"
          empty="Nenhuma perda registrada no período."
          columns={[
            { key: "name", label: "Item", value: (r) => r.name, render: (r) => <span className="font-medium">{r.name}</span> },
            { key: "reason", label: "Motivo principal", value: (r) => r.reason },
            { key: "qty", label: "Quantidade", align: "right", value: (r) => r.qty, render: (r) => `${qty(r.qty)} ${r.unit}` },
            { key: "value", label: "Valor", align: "right", value: (r) => r.value, render: (r) => money(r.value) },
            { key: "share", label: "% das perdas", align: "right", value: (r) => (k.losses > 0 ? r.value / k.losses : 0), render: (r) => pctFmt(k.losses > 0 ? r.value / k.losses : 0) },
          ]}
        />
      </Panel>
      <Panel title="Validade dos lotes" desc="Lotes recebidos com validade nos próximos 90 dias e itens ainda com saldo · valor em risco limitado ao saldo atual" icon={<CalendarClock className={ic} />}>
        <HBarList theme={theme} format={money} rows={exp.map((b) => ({ label: b.label, value: b.value, sub: `${b.count} lote(s)`, color: toneColor[b.tone] }))} />
      </Panel>
      <Panel title="Lotes a vencer" flush avoidBreak={false}>
        <DataTable
          rows={d.expiry.lots}
          exportName="lotes-validade"
          initialSort="days"
          initialDir="asc"
          empty="Nenhum lote vencendo nos próximos 90 dias."
          minWidth={820}
          columns={[
            { key: "item", label: "Item", value: (r) => r.item, render: (r) => <span className="font-medium">{r.item}</span> },
            { key: "lot", label: "Lote", value: (r) => r.lot, render: (r) => <span className="font-mono text-[11.5px]">{r.lot ?? "—"}</span> },
            { key: "location", label: "Local", value: (r) => r.location },
            { key: "expiry", label: "Validade", align: "right", value: (r) => r.expiry, render: (r) => fmtDay(r.expiry) },
            { key: "days", label: "Dias", align: "right", value: (r) => r.days, render: (r) => <span className={cn("font-semibold", r.days < 0 ? "text-red-500" : r.days <= 7 ? "text-amber-500" : "")}>{r.days < 0 ? `vencido há ${-r.days}` : r.days}</span> },
            { key: "qty", label: "Recebido", align: "right", value: (r) => r.qty, render: (r) => `${qty(r.qty)} ${r.unit}` },
            { key: "risk", label: "Em risco", align: "right", value: (r) => r.risk, render: (r) => `${qty(r.risk)} ${r.unit}` },
            { key: "value", label: "Valor em risco", align: "right", value: (r) => r.value, render: (r) => money(r.value) },
          ]}
        />
      </Panel>
    </div>
  );
}

/* ================================================================ Movimentação */

export function MovimentacaoSection({ d }: P) {
  const { theme, mode } = useRT();
  const k = d.kpis;
  const p = d.prev;
  return (
    <div className="space-y-4">
      <div className={KPI_GRID}>
        <Metric label="Entradas" value={int(k.entradasCount)} delta={pctChange(k.entradasCount, p.entradasCount)} neutral hint="compras, ajustes e empréstimos" icon={<ArrowDownToLine className={ic} />} />
        <Metric label="Saídas" value={int(k.saidasCount)} delta={pctChange(k.saidasCount, p.saidasCount)} neutral hint="consumo, perdas e ajustes" icon={<ArrowUpFromLine className={ic} />} />
        <Metric label="Transferências" value={int(k.transfersCount)} delta={pctChange(k.transfersCount, p.transfersCount)} neutral icon={<ArrowLeftRight className={ic} />} />
        <Metric label="Ajustes de inventário" value={money(k.adjustNet)} hint={`+${money(k.adjustIn)} / −${money(k.adjustOut)}`} tone={k.adjustNet < 0 ? "red" : undefined} icon={<ClipboardCheck className={ic} />} />
      </div>
      <Panel title="Volume de movimentações" desc={`Quantidade de documentos por ${BUCKET_NAME[d.filters.bucket]}`} icon={<Activity className={ic} />}>
        <BarChart
          data={d.series}
          stacked
          theme={theme}
          interactive={mode === "screen"}
          format={(n) => int(n)}
          series={[
            { key: "entradas", label: "Entradas", color: COLORS.purchases },
            { key: "saidas", label: "Saídas", color: COLORS.consumption },
            { key: "transferencias", label: "Transferências", color: COLORS.sky },
          ]}
        />
        <Legend theme={theme} items={[{ label: "Entradas", color: COLORS.purchases }, { label: "Saídas", color: COLORS.consumption }, { label: "Transferências", color: COLORS.sky }]} />
      </Panel>
      <Panel title="Quando a equipe registra" desc="Movimentações por dia da semana e hora do lançamento" icon={<CalendarClock className={ic} />}>
        <Heatmap matrix={d.heatmap} theme={theme} rowLabels={ROW_ORDER} />
      </Panel>
      <div className={TWO_COL}>
        <Panel title="Fluxo por local" desc="Valor que entrou e saiu de cada local no período" flush avoidBreak={false}>
          <DataTable
            rows={d.locations}
            exportName="fluxo-por-local"
            initialSort="stock"
            minWidth={520}
            columns={[
              { key: "name", label: "Local", value: (r) => r.name, render: (r) => <span className="font-medium">{r.name}</span> },
              { key: "stock", label: "Estoque", align: "right", value: (r) => r.stockValue, render: (r) => money(r.stockValue) },
              { key: "in", label: "Entrou", align: "right", value: (r) => r.inValue, render: (r) => <span className="text-emerald-500">{money(r.inValue)}</span> },
              { key: "out", label: "Saiu", align: "right", value: (r) => r.outValue, render: (r) => <span className="text-amber-500">{money(r.outValue)}</span> },
            ]}
          />
        </Panel>
        <Panel title="Transferências entre locais" flush avoidBreak={false}>
          <DataTable
            rows={d.transfers}
            exportName="transferencias"
            initialSort="value"
            empty="Nenhuma transferência no período."
            minWidth={520}
            columns={[
              { key: "route", label: "Origem → destino", value: (r) => `${r.from} → ${r.to}`, render: (r) => <span className="font-medium">{r.from} <span className="opacity-50">→</span> {r.to}</span> },
              { key: "count", label: "Qtde.", align: "right", value: (r) => r.count },
              { key: "qty", label: "Unidades", align: "right", value: (r) => r.qty, render: (r) => qty(r.qty) },
              { key: "value", label: "Valor", align: "right", value: (r) => r.value, render: (r) => money(r.value) },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}

/* ================================================================ Inventário */

export function InventarioSection({ d }: P) {
  const { theme } = useRT();
  const inv = d.inventory;
  return (
    <div className="space-y-4">
      <div className={KPI_GRID}>
        <Metric label="Contagens concluídas" value={int(inv.counts.length)} hint={`${inv.counts.reduce((s, c) => s + c.lines, 0)} itens contados`} icon={<ClipboardCheck className={ic} />} />
        <Metric label="Acurácia" value={pctFmt(inv.accuracy)} hint="itens sem divergência" tone={inv.accuracy === null ? undefined : inv.accuracy >= 0.95 ? "green" : inv.accuracy >= 0.85 ? "amber" : "red"} icon={<Target className={ic} />} />
        <Metric label="Divergência absoluta" value={money(inv.divergenceValue)} hint="|contado − sistema| × custo" icon={<Scale className={ic} />} />
        <Metric label="Ajuste líquido" value={money(inv.netValue)} hint={inv.netValue < 0 ? "faltou mercadoria" : inv.netValue > 0 ? "sobrou mercadoria" : "sem diferença"} tone={inv.netValue < 0 ? "red" : undefined} icon={<Sigma className={ic} />} />
      </div>
      {inv.counts.length > 0 ? (
        <Panel title="Acurácia por contagem" icon={<Target className={ic} />}>
          <HBarList theme={theme} format={(n) => pctFmt(n)} rows={inv.counts.map((c) => ({ label: `${c.code} · ${c.location}`, value: c.accuracy ?? 0, sub: `${c.exact}/${c.lines}`, color: (c.accuracy ?? 0) >= 0.95 ? COLORS.purchases : (c.accuracy ?? 0) >= 0.85 ? COLORS.consumption : COLORS.losses }))} />
        </Panel>
      ) : null}
      <Panel title="Contagens do período" flush avoidBreak={false}>
        <DataTable
          rows={inv.counts}
          exportName="inventarios"
          initialSort="date"
          empty="Nenhum inventário concluído no período."
          columns={[
            { key: "code", label: "Código", value: (r) => r.code, render: (r) => <span className="font-mono font-semibold">{r.code}</span> },
            { key: "location", label: "Escopo", value: (r) => r.location },
            { key: "date", label: "Concluído em", align: "right", value: (r) => r.finishedAt, render: (r) => fmtDay(r.finishedAt) },
            { key: "lines", label: "Contados", align: "right", value: (r) => r.lines },
            { key: "acc", label: "Acurácia", align: "right", value: (r) => r.accuracy, render: (r) => pctFmt(r.accuracy) },
            { key: "div", label: "Divergência", align: "right", value: (r) => r.divergenceValue, render: (r) => money(r.divergenceValue) },
            { key: "net", label: "Ajuste líquido", align: "right", value: (r) => r.netValue, render: (r) => <span className={r.netValue < 0 ? "text-red-500" : r.netValue > 0 ? "text-emerald-500" : ""}>{money(r.netValue)}</span> },
          ]}
        />
      </Panel>
    </div>
  );
}

/* ================================================================ Empréstimos */

export function EmprestimosSection({ d }: P) {
  const { theme, mode } = useRT();
  const l = d.loans;
  return (
    <div className="space-y-4">
      <div className={KPI_GRID}>
        <Metric label="A receber de parceiros" value={money(l.toReceive)} hint="o que emprestamos" icon={<ArrowUpFromLine className={ic} />} />
        <Metric label="A devolver a parceiros" value={money(l.toReturn)} hint="o que pegamos" icon={<ArrowDownToLine className={ic} />} />
        <Metric label="Saldo líquido" value={money(l.net)} hint={l.net >= 0 ? "a nosso favor" : "devemos mais do que temos a receber"} tone={l.net < 0 ? "red" : l.net > 0 ? "green" : undefined} icon={<Scale className={ic} />} />
        <Metric label="Vencidos" value={money(l.overdueValue)} hint={`${l.overdueCount} de ${l.openCount} em aberto`} tone={l.overdueCount > 0 ? "red" : "green"} icon={<AlertTriangle className={ic} />} />
        <Metric label="Criados no período" value={int(l.createdInPeriod)} icon={<Handshake className={ic} />} />
        <Metric label="Quitados no período" value={int(l.settledInPeriod)} icon={<CheckCircle2 className={ic} />} />
        <Metric label="Prazo médio de quitação" value={daysFmt(l.avgDaysToSettle)} hint="da retirada ao acerto final" icon={<Timer className={ic} />} />
        <Metric label="Em aberto" value={int(l.openCount)} icon={<Activity className={ic} />} />
      </div>
      <Panel title="Aging das pendências" desc="Valor pendente por faixa de vencimento" icon={<CalendarClock className={ic} />}>
        <BarChart
          data={l.aging.map((a) => ({ label: a.label, receive: a.receive, ret: a.ret }))}
          theme={theme}
          interactive={mode === "screen"}
          format={moneyShort}
          series={[{ key: "receive", label: "A receber", color: COLORS.sky }, { key: "ret", label: "A devolver", color: COLORS.violet }]}
        />
        <Legend theme={theme} items={[{ label: "A receber", color: COLORS.sky }, { label: "A devolver", color: COLORS.violet }]} />
      </Panel>
      <div className={TWO_COL}>
        <Panel title="Posição por parceiro" flush avoidBreak={false}>
          <DataTable
            rows={l.byPartner}
            exportName="emprestimos-parceiros"
            initialSort="receive"
            empty="Nenhum empréstimo em aberto."
            minWidth={520}
            columns={[
              { key: "partner", label: "Parceiro", value: (r) => r.partner, render: (r) => <span className="font-medium">{r.partner}</span> },
              { key: "receive", label: "Nos deve", align: "right", value: (r) => r.receive, render: (r) => money(r.receive) },
              { key: "ret", label: "Devemos", align: "right", value: (r) => r.ret, render: (r) => money(r.ret) },
              { key: "open", label: "Abertos", align: "right", value: (r) => r.open },
              { key: "overdue", label: "Vencidos", align: "right", value: (r) => r.overdue, render: (r) => <span className={r.overdue > 0 ? "font-semibold text-red-500" : ""}>{r.overdue}</span> },
            ]}
          />
        </Panel>
        <Panel title="Empréstimos em aberto" flush avoidBreak={false}>
          <DataTable
            rows={l.open}
            exportName="emprestimos-abertos"
            initialSort="days"
            initialDir="asc"
            empty="Nenhum empréstimo em aberto."
            minWidth={560}
            columns={[
              { key: "code", label: "Código", value: (r) => r.code, render: (r) => <span className="font-mono font-semibold">{r.code}</span> },
              { key: "partner", label: "Parceiro", value: (r) => r.partner },
              { key: "dir", label: "Direção", value: (r) => (r.direction === "emprestamos" ? "A receber" : "A devolver") },
              { key: "days", label: "Prazo", align: "right", value: (r) => r.daysLeft, render: (r) => <span className={cn(r.daysLeft < 0 ? "font-semibold text-red-500" : r.daysLeft <= 3 ? "text-amber-500" : "")}>{fmtDay(r.due)}{r.daysLeft < 0 ? ` (−${-r.daysLeft}d)` : ""}</span> },
              { key: "value", label: "Pendente", align: "right", value: (r) => r.value, render: (r) => money(r.value) },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}

/* ================================================================ Projeções */

export function ProjecoesSection({ d }: P) {
  const { theme, mode } = useRT();
  const f = d.forecast;
  const hist = f.history.slice(-90);
  const lastVal = hist.length ? (hist[hist.length - 1].ma7 ?? hist[hist.length - 1].value) : null;
  const chart = [
    ...hist.map((h, i) => ({ label: fmtDayShort(h.date), real: h.value, ma7: h.ma7, prev: i === hist.length - 1 ? lastVal : null, low: null, high: null })),
    ...f.points.map((p) => ({ label: fmtDayShort(p.date), real: null, ma7: null, prev: p.value, low: p.low, high: p.high })),
  ];
  const suggestions = d.items.filter((i) => i.suggestion > 0);
  const horizonEnd = f.points.length ? f.points[f.points.length - 1].date : d.today;
  const ruptures = d.items.filter((i) => i.status === "ruptura" || (i.ruptureDate !== null && i.ruptureDate <= horizonEnd));
  const methodTxt = f.method === "regressao" ? "Regressão linear com sazonalidade semanal" : f.method === "media" ? "Média simples (histórico curto)" : "Histórico insuficiente";
  return (
    <div className="space-y-4">
      <div className={KPI_GRID}>
        <Metric label={`Consumo projetado (${d.filters.horizon} dias)`} value={money(f.total)} hint={f.method === "insuficiente" ? "sem histórico de consumo" : `faixa ${moneyShort(f.low)} – ${moneyShort(f.high)}`} icon={<TrendingUp className={ic} />} />
        <Metric label="Tendência" value={f.trendPctMonth === null ? "—" : `${signedPct(f.trendPctMonth / 100)}/mês`} hint={methodTxt} tone={f.trendPctMonth !== null && f.trendPctMonth > 10 ? "amber" : undefined} icon={<Activity className={ic} />} />
        <Metric label="Estoque projetado sem compras" value={money(f.projectedStockValue)} hint={`hoje ${money(d.stock.value)}`} icon={<Wallet className={ic} />} />
        <Metric label="Necessidade de compra" value={money(f.purchaseNeed)} hint={`${suggestions.length} item(ns) · meta ${d.filters.targetDays} dias`} tone={f.purchaseNeed > 0 ? "amber" : "green"} icon={<ShoppingCart className={ic} />} />
      </div>

      <Panel title="Projeção de consumo diário" desc={`Histórico (até 90 dias), média móvel de 7 dias e projeção com faixa de ~80% de confiança${f.r2 !== null ? ` · R² ${dec(f.r2, 2)}` : ""}`} icon={<TrendingUp className={ic} />}>
        <LineChart
          data={chart}
          theme={theme}
          interactive={mode === "screen"}
          format={moneyShort}
          divider={{ index: hist.length, label: "Projeção" }}
          band={{ low: "low", high: "high", color: COLORS.sky, label: "Faixa provável" }}
          series={[
            { key: "real", label: "Consumo real", color: COLORS.consumption, width: 1.4 },
            { key: "ma7", label: "Média móvel 7d", color: COLORS.zinc, dashed: true },
            { key: "prev", label: "Projeção", color: COLORS.sky, width: 2.6 },
          ]}
        />
        <Legend theme={theme} items={[{ label: "Consumo real", color: COLORS.consumption }, { label: "Média móvel 7 dias", color: COLORS.zinc, dashed: true }, { label: "Projeção", color: COLORS.sky }, { label: "Faixa provável (80%)", color: `${COLORS.sky}55` }]} />
      </Panel>

      <div className={TWO_COL}>
        <Panel title="Sazonalidade semanal" desc="Fator de cada dia sobre a média (1,0 = dia típico) usado na projeção" icon={<CalendarClock className={ic} />}>
          <BarChart data={[1, 2, 3, 4, 5, 6, 0].map((w) => ({ label: WEEKDAYS[w], f: f.weekdayFactors[w] ?? 1 }))} theme={theme} interactive={mode === "screen"} format={(n) => `${dec(n, 2)}x`} series={[{ key: "f", label: "Fator", color: COLORS.violet }]} />
        </Panel>
        <Panel title="Como a projeção é calculada" icon={<Info className={ic} />}>
          <div className="space-y-2.5">
            <Note><strong>Método:</strong> {methodTxt}. A série diária de consumo do período é dessazonalizada por dia da semana (com ≥ 14 dias), ajustada por mínimos quadrados (com ≥ 7 dias) e projetada para os próximos {d.filters.horizon} dias.</Note>
            <Note><strong>Faixa provável:</strong> ±1,28 desvio-padrão dos resíduos (~80%). No total do horizonte, a incerteza cresce com √dias.</Note>
            <Note><strong>Cobertura e ruptura:</strong> saldo atual ÷ saída média diária (consumo + perdas) do período, sem considerar novas compras.</Note>
            <Note><strong>Sugestão de compra:</strong> saída diária × (meta de {d.filters.targetDays} dias + prazo de entrega do item) + estoque mínimo − saldo. Unidades inteiras são arredondadas para cima.</Note>
            <Note><strong>Rupturas no horizonte:</strong> {f.rupturesInHorizon} item(ns) zerados ou previstos para acabar até {fmtDay(horizonEnd)}.</Note>
          </div>
        </Panel>
      </div>

      <Panel title="Sugestão de compra" desc={`Para cobrir ${d.filters.targetDays} dias de consumo + prazo de entrega, respeitando o mínimo`} icon={<ShoppingCart className={ic} />} flush avoidBreak={false}>
        <DataTable<ItemMetric>
          rows={suggestions}
          exportName="sugestao-de-compra"
          initialSort="value"
          limit={15}
          minWidth={860}
          empty="Nenhuma compra necessária para a meta de cobertura."
          footer={["Total estimado", "", "", "", "", "", "", money(f.purchaseNeed)]}
          columns={[
            { key: "name", label: "Item", value: (r) => r.name, render: (r) => <Name title={r.name} sub={r.sku} /> },
            { key: "stock", label: "Saldo", align: "right", value: (r) => r.stock, render: (r) => `${qty(r.stock)} ${r.unit}` },
            { key: "min", label: "Mínimo", align: "right", value: (r) => r.min, render: (r) => (r.min > 0 ? qty(r.min) : "—") },
            { key: "avg", label: "Saída/dia", align: "right", value: (r) => r.avgDaily, render: (r) => (r.avgDaily > 0 ? qty(Math.round(r.avgDaily * 1000) / 1000) : "—") },
            { key: "lead", label: "Entrega", align: "right", value: (r) => r.leadTime, render: (r) => (r.leadTime > 0 ? `${r.leadTime}d` : "—") },
            { key: "cov", label: "Cobertura atual", align: "right", value: (r) => r.coverageDays, render: (r) => daysFmt(r.coverageDays) },
            { key: "sug", label: "Comprar", align: "right", value: (r) => r.suggestion, render: (r) => <span className="font-semibold">{qty(r.suggestion)} {r.unit}</span> },
            { key: "value", label: "Custo estimado", align: "right", value: (r) => r.suggestionValue, render: (r) => money(r.suggestionValue) },
          ]}
        />
      </Panel>

      <Panel title="Previsão de ruptura" desc={`Itens zerados ou que acabam até ${fmtDay(horizonEnd)} no ritmo atual`} icon={<AlertTriangle className={ic} />} flush avoidBreak={false}>
        <DataTable<ItemMetric>
          rows={ruptures}
          exportName="previsao-ruptura"
          initialSort="date"
          initialDir="asc"
          empty="Nenhuma ruptura prevista no horizonte."
          columns={[
            { key: "name", label: "Item", value: (r) => r.name, render: (r) => <Name title={r.name} sub={r.sku} /> },
            { key: "stock", label: "Saldo", align: "right", value: (r) => r.stock, render: (r) => `${qty(r.stock)} ${r.unit}` },
            { key: "avg", label: "Saída/dia", align: "right", value: (r) => r.avgDaily, render: (r) => (r.avgDaily > 0 ? qty(Math.round(r.avgDaily * 1000) / 1000) : "—") },
            { key: "cov", label: "Acaba em", align: "right", value: (r) => (r.status === "ruptura" ? 0 : r.coverageDays), render: (r) => (r.status === "ruptura" ? "já zerado" : daysFmt(r.coverageDays)) },
            { key: "date", label: "Data prevista", align: "right", value: (r) => (r.status === "ruptura" ? d.today : r.ruptureDate), render: (r) => (r.status === "ruptura" ? "—" : fmtDay(r.ruptureDate)) },
            { key: "status", label: "Status", value: (r) => r.status, render: (r) => <StatusTag s={r.status} /> },
          ]}
        />
      </Panel>
    </div>
  );
}

/* ================================================================ Extrato */

export function ExtratoSection({ d }: P) {
  const total = d.movementsLog.reduce((s, m) => s + m.value, 0);
  return (
    <Panel title="Extrato de movimentações" desc={`Documentos confirmados no período (${d.movementsLog.length}) · valores ao custo informado ou médio`} flush avoidBreak={false}>
      <DataTable
        rows={d.movementsLog}
        exportName="extrato-movimentacoes"
        initialSort="date"
        limit={25}
        minWidth={900}
        footer={["Total", "", "", "", "", int(d.movementsLog.reduce((s, m) => s + m.items, 0)), money(total)]}
        columns={[
          { key: "date", label: "Data", value: (r) => r.date, render: (r) => fmtDay(r.date) },
          { key: "code", label: "Documento", value: (r) => r.code, render: (r) => <span className="font-mono font-semibold">{r.code}</span> },
          { key: "cls", label: "Tipo", value: (r) => CLS_LABEL[r.cls], render: (r) => <Chip>{CLS_LABEL[r.cls]}</Chip> },
          { key: "desc", label: "Motivo / fornecedor", value: (r) => r.supplier || r.reason || "" , render: (r) => <span className="line-clamp-1 max-w-[240px]">{r.supplier || r.reason || "—"}</span> },
          { key: "route", label: "Local", value: (r) => (r.from && r.to ? `${r.from} → ${r.to}` : r.to || r.from || ""), render: (r) => (r.from && r.to ? `${r.from} → ${r.to}` : r.to || r.from || "—") },
          { key: "items", label: "Itens", align: "right", value: (r) => r.items },
          { key: "value", label: "Valor", align: "right", value: (r) => r.value, render: (r) => money(r.value) },
        ]}
      />
    </Panel>
  );
}

export const SECTION_COMPONENTS: Record<SectionId, (p: P) => ReactNode> = {
  overview: OverviewSection,
  consumo: ConsumoSection,
  estoque: EstoqueSection,
  compras: ComprasSection,
  perdas: PerdasSection,
  movimentacao: MovimentacaoSection,
  inventario: InventarioSection,
  emprestimos: EmprestimosSection,
  projecoes: ProjecoesSection,
  extrato: ExtratoSection,
};
