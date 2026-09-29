"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Loader2, Printer, X } from "lucide-react";
import { api } from "@/lib/api";
import { ReportThemeProvider, KPI_GRID, Metric } from "@/components/reports/kit";
import { InsightsList, SECTION_COMPONENTS } from "@/components/reports/sections";
import { fmtDay } from "@/lib/reports/dates";
import { BUCKET_NAME, daysFmt, dec, int, money, pctChange, pctFmt } from "@/lib/reports/fmt";
import { SECTIONS, type ReportData, type SectionId } from "@/lib/reports/types";
import { initials } from "@/lib/format";

export default function PrintReportPage() {
  return (
    <Suspense fallback={<Centered>Preparando relatório…</Centered>}>
      <PrintReport />
    </Suspense>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-zinc-100 text-[14px] text-zinc-600">{children}</div>;
}

function PrintReport() {
  const sp = useSearchParams();
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const sections = useMemo<SectionId[]>(() => {
    const valid = SECTIONS.map((s) => s.id);
    const req = (sp.get("s") ?? "").split(",").filter((x): x is SectionId => (valid as string[]).includes(x));
    return req.length ? valid.filter((id) => req.includes(id)) : valid;
  }, [sp]);
  const auto = sp.get("auto") === "1";
  const query = useMemo(() => {
    const q = new URLSearchParams(sp.toString());
    q.delete("s");
    q.delete("auto");
    return q.toString();
  }, [sp]);

  useEffect(() => {
    document.documentElement.classList.add("print-doc");
    return () => document.documentElement.classList.remove("print-doc");
  }, []);

  useEffect(() => {
    let alive = true;
    api<ReportData>(`/api/reports?${query}`).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setData(r.data);
        document.title = `Relatório de estoque ${fmtDay(r.data.filters.from)} a ${fmtDay(r.data.filters.to)} · ${r.data.restaurantName}`;
      } else setError(r.error ?? "Erro ao gerar o relatório");
    });
    return () => {
      alive = false;
    };
  }, [query]);

  useEffect(() => {
    if (!data || !auto) return;
    const t = setTimeout(() => window.print(), 900);
    return () => clearTimeout(t);
  }, [data, auto]);

  const downloadPdf = async () => {
    if (!data || pdfBusy) return;
    setPdfBusy(true);
    try {
      const { generateReportPdf } = await import("@/lib/reports/pdf");
      await generateReportPdf(data, sections);
    } finally {
      setPdfBusy(false);
    }
  };

  if (error) return <Centered>{error}</Centered>;
  if (!data) return <Centered><span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Consolidando dados do relatório…</span></Centered>;

  const f = data.filters;
  const k = data.kpis;
  const p = data.prev;
  const period = `${fmtDay(f.from)} a ${fmtDay(f.to)}`;
  const esc = (t: string) => t.replace(/["\\]/g, "");
  const toc = [{ id: "resumo", label: "Resumo executivo" }, ...sections.map((id) => ({ id, label: SECTIONS.find((s) => s.id === id)!.label }))];

  return (
    <div className="min-h-screen bg-zinc-200 py-6 print:bg-white print:py-0">
      <style>{`
        @page {
          size: A4;
          margin: 14mm 12mm 16mm 12mm;
          @bottom-left { content: "${esc(data.restaurantName)} · Relatório gerencial de estoque · ${period}"; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 7.5pt; color: #71717a; }
          @bottom-right { content: "Página " counter(page) " de " counter(pages); font-family: ui-sans-serif, system-ui, sans-serif; font-size: 7.5pt; color: #71717a; }
        }
      `}</style>

      {/* barra de ações (não imprime) */}
      <div className="sticky top-0 z-20 mx-auto mb-5 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-300 bg-white/95 px-4 py-3 shadow-sm backdrop-blur print:hidden">
        <div className="text-[13px] text-zinc-600">
          <strong className="text-zinc-900">Pré-visualização de impressão</strong> · A4 · {toc.length} seção(ões)
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.close()} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50">
            <X className="size-4" /> Fechar
          </button>
          <button onClick={downloadPdf} disabled={pdfBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
            {pdfBusy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Baixar PDF
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-zinc-800">
            <Printer className="size-4" /> Imprimir / Salvar como PDF
          </button>
        </div>
      </div>

      <ReportThemeProvider mode="print">
        <main className="report-doc mx-auto w-full max-w-[210mm] bg-white text-zinc-900 shadow-xl print:max-w-none print:shadow-none">
          {/* Capa */}
          <section className="flex min-h-[270mm] flex-col print:min-h-[262mm]">
            <div className="bg-[#0b0b0d] px-10 pb-10 pt-12 text-white">
              <div className="flex items-center gap-3">
                <div className="grid size-12 place-items-center rounded-lg bg-white text-[15px] font-black text-zinc-950">{initials(data.restaurantName) || "SD"}</div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Controle de estoque</p>
                  <p className="text-[16px] font-bold">{data.restaurantName}</p>
                </div>
              </div>
              <h1 className="mt-14 text-[34px] font-bold leading-tight tracking-tight">Relatório gerencial de estoque</h1>
              <p className="mt-3 text-[16px] text-zinc-300">{period} · {f.days} dia{f.days === 1 ? "" : "s"}</p>
              <p className="mt-1 text-[12px] text-zinc-400">
                Comparado com {fmtDay(f.prevFrom)} a {fmtDay(f.prevTo)} · Gerado em {new Date(data.generatedAt).toLocaleString("pt-BR")}
              </p>
            </div>
            <div className="flex flex-1 flex-col px-10 py-8">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-zinc-500">Parâmetros</h2>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {[
                  ["Período", period],
                  ["Local", f.locationName ?? "Todos os locais"],
                  ["Categoria", f.categoryName ?? "Todas as categorias"],
                  ["Agrupamento", `Por ${BUCKET_NAME[f.bucket]}`],
                  ["Meta de cobertura", `${f.targetDays} dias`],
                  ["Horizonte de projeção", `${f.horizon} dias`],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{l}</p>
                    <p className="mt-0.5 truncate text-[13px] font-semibold text-zinc-900">{v}</p>
                  </div>
                ))}
              </div>
              <h2 className="mt-8 text-[13px] font-bold uppercase tracking-[0.12em] text-zinc-500">Conteúdo</h2>
              <ol className="mt-3 space-y-1.5">
                {toc.map((t, i) => (
                  <li key={t.id} className="flex items-baseline gap-3 text-[13.5px]">
                    <span className="w-6 font-mono text-[12px] text-zinc-400">{String(i).padStart(2, "0")}</span>
                    <span className="font-medium text-zinc-800">{t.label}</span>
                    <span className="flex-1 border-b border-dotted border-zinc-300" />
                  </li>
                ))}
              </ol>
              <p className="mt-auto pt-8 text-[10.5px] leading-relaxed text-zinc-500">
                Valores monetários calculados pelo custo informado em cada movimentação ou, na falta, pelo custo médio cadastrado do item.
                Empréstimos entre restaurantes não entram como compra ou consumo. Projeções assumem o ritmo do período analisado.
              </p>
            </div>
          </section>

          {/* Resumo executivo */}
          <section className="break-before-page px-10 py-8 print:px-0 print:py-0">
            <SectionHeader index={0} title="Resumo executivo" period={period} desc="Principais indicadores do período e leitura automática dos desvios mais relevantes." />
            <div className="space-y-4">
              <div className={KPI_GRID}>
                <Metric label="Compras" value={money(k.purchases)} delta={pctChange(k.purchases, p.purchases)} neutral hint={`${k.purchasesCount} recebimento(s)`} />
                <Metric label="Consumo" value={money(k.consumption)} delta={pctChange(k.consumption, p.consumption)} invert hint={`${money(k.avgDailyConsumption)}/dia`} />
                <Metric label="Perdas" value={money(k.losses)} delta={pctChange(k.losses, p.losses)} invert hint={`taxa ${pctFmt(k.lossRate)}`} tone={k.lossRate >= 0.05 ? "red" : undefined} />
                <Metric label="Valor em estoque" value={money(data.stock.value)} hint={`${data.stock.withStock} itens com saldo`} />
                <Metric label="Giro anualizado" value={data.stock.turnoverAnnual === null ? "—" : `${dec(data.stock.turnoverAnnual)}x`} />
                <Metric label="Cobertura (DIO)" value={daysFmt(data.stock.dio)} />
                <Metric label="Rupturas" value={int(data.stock.ruptures)} tone={data.stock.ruptures > 0 ? "red" : "green"} hint={`${data.stock.belowMin} abaixo do mínimo`} />
                <Metric label="Necessidade de compra" value={money(data.forecast.purchaseNeed)} hint={`meta ${f.targetDays} dias`} />
              </div>
              <div>
                <h3 className="mb-2.5 text-[14px] font-semibold text-zinc-900">Destaques do período</h3>
                <InsightsList d={data} />
              </div>
            </div>
          </section>

          {sections.map((id, i) => {
            const Comp = SECTION_COMPONENTS[id];
            const label = SECTIONS.find((s) => s.id === id)!.label;
            return (
              <section key={id} className="break-before-page px-10 py-8 print:px-0 print:py-0">
                <SectionHeader index={i + 1} title={label} period={period} />
                <Comp d={data} />
              </section>
            );
          })}
        </main>
      </ReportThemeProvider>
    </div>
  );
}

function SectionHeader({ index, title, period, desc }: { index: number; title: string; period: string; desc?: string }) {
  return (
    <div className="mb-5 break-after-avoid">
      <div className="flex items-center justify-between gap-4 rounded-lg bg-zinc-900 px-5 py-3 text-white">
        <p className="flex items-baseline gap-3">
          <span className="font-mono text-[12px] text-zinc-400">{String(index).padStart(2, "0")}</span>
          <span className="text-[17px] font-bold tracking-tight">{title}</span>
        </p>
        <span className="text-[11.5px] text-zinc-300">{period}</span>
      </div>
      {desc ? <p className="mt-2 text-[12px] text-zinc-500">{desc}</p> : null}
    </div>
  );
}
