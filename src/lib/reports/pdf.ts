import type { ReportData, SectionId, ItemMetric } from "./types";
import { SECTIONS, CLS_LABEL, STATUS_LABEL } from "./types";
import { fmtDay, fmtDayShort, WEEKDAYS } from "./dates";
import { BUCKET_NAME, daysFmt, dec, int, money, moneyShort, pctChange, pctFmt, qty, signedPct } from "./fmt";
import { initials } from "@/lib/format";

type RGB = [number, number, number];
type Align = "left" | "right" | "center";

const hex = (h: string): RGB => {
  const x = h.replace("#", "");
  return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
};
const tint = (h: string, a: number): RGB => hex(h).map((c) => Math.round(255 - (255 - c) * a)) as RGB;

const C = {
  ink: hex("#18181b"),
  text: hex("#3f3f46"),
  muted: hex("#71717a"),
  line: hex("#e4e4e7"),
  soft: hex("#f4f4f5"),
  white: [255, 255, 255] as RGB,
};
const K = {
  purchases: "#10b981",
  consumption: "#f59e0b",
  losses: "#ef4444",
  sky: "#0ea5e9",
  violet: "#8b5cf6",
  orange: "#f97316",
  zinc: "#a1a1aa",
  pink: "#ec4899",
};
const STATUS_HEX: Record<ItemMetric["status"], string> = {
  ruptura: K.losses,
  critico: K.orange,
  atencao: K.consumption,
  parado: K.violet,
  sem_giro: K.zinc,
  ok: K.purchases,
};

/** jsPDF usa fontes padrão (WinAnsi): troca símbolos sem suporte e remove o resto. */
const MAP: Record<string, string> = {
  "—": "-", "–": "-", "→": "->", "…": "...", "≈": "~", "“": '"', "”": '"', "‘": "'", "’": "'",
  "•": "-", "−": "-", "≥": ">=", "≤": "<=", "\u00a0": " ", "\u202f": " ", "√": "raiz ", "±": "+/-",
};
export const s = (v: unknown) =>
  String(v ?? "")
    .replace(/[—–→…≈“”‘’•−≥≤\u00a0\u202f√]/g, (ch) => MAP[ch] ?? "")
    .replace(/[^\x00-\xFF]/g, "");

const niceMax = (v: number) => {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
};
const byCoverage = (a: ItemMetric, b: ItemMetric) => (a.coverageDays ?? Infinity) - (b.coverageDays ?? Infinity);

export async function generateReportPdf(d: ReportData, sections: SectionId[], opts: { returnBuffer?: boolean } = {}): Promise<ArrayBuffer | void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const PW = 210, PH = 297, M = 14, CW = PW - 2 * M, TOP = 22, BOTTOM = PH - 17;
  const f = d.filters;
  const period = `${fmtDay(f.from)} a ${fmtDay(f.to)}`;
  const generated = new Date(d.generatedAt).toLocaleString("pt-BR");
  const bn = BUCKET_NAME[f.bucket];
  let y = TOP;

  /* ------------------------------------------------------------ primitivas */
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const draw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const font = (size: number, style: "normal" | "bold" = "normal", color: RGB = C.text) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
  };
  const text = (t: unknown, x: number, yy: number, align: Align = "left") => doc.text(s(t), x, yy, { align });
  const fit = (t: unknown, w: number) => {
    let str = s(t);
    if (doc.getTextWidth(str) <= w) return str;
    while (str.length > 1 && doc.getTextWidth(`${str}...`) > w) str = str.slice(0, -1);
    return `${str}...`;
  };
  const ensure = (h: number) => {
    if (y + h > BOTTOM) {
      doc.addPage();
      y = TOP;
    }
  };
  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  const poly = (pts: [number, number][]) => {
    if (pts.length < 3) return;
    const segs = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
    doc.lines(segs, pts[0][0], pts[0][1], [1, 1], "F", true);
  };
  const paragraph = (t: string, size = 8) => {
    font(size, "normal", C.text);
    const lines = doc.splitTextToSize(s(t), CW) as string[];
    ensure(lines.length * size * 0.42 + 2);
    doc.text(lines, M, y + 3);
    y += lines.length * size * 0.42 + 2.5;
  };

  /* ------------------------------------------------------------ blocos */
  const sectionStarts: { page: number; title: string }[] = [];
  const toc: { title: string; page: number }[] = [];

  const sectionHeader = (idx: number, title: string, desc?: string) => {
    doc.addPage();
    y = TOP;
    const page = doc.getNumberOfPages();
    sectionStarts.push({ page, title });
    toc.push({ title, page });
    fill(C.ink);
    doc.roundedRect(M, y, CW, 14, 2, 2, "F");
    font(8, "bold", hex("#a1a1aa"));
    text(String(idx).padStart(2, "0"), M + 5, y + 8.8);
    font(12.5, "bold", C.white);
    text(title, M + 13, y + 9);
    font(7.8, "normal", hex("#d4d4d8"));
    text(period, M + CW - 5, y + 8.8, "right");
    y += 19;
    if (desc) {
      font(8.2, "normal", C.muted);
      const lines = doc.splitTextToSize(s(desc), CW) as string[];
      doc.text(lines, M, y);
      y += lines.length * 3.6 + 3;
    }
  };

  const sub = (t: string, desc?: string) => {
    ensure(desc ? 22 : 16);
    font(10.2, "bold", C.ink);
    text(t, M, y + 4);
    y += 6.5;
    if (desc) {
      font(7.6, "normal", C.muted);
      const lines = doc.splitTextToSize(s(desc), CW) as string[];
      doc.text(lines, M, y + 1.5);
      y += lines.length * 3.3 + 2;
    }
    y += 1;
  };

  type Kpi = { label: string; value: string; sub?: string; delta?: number | null; invert?: boolean; neutral?: boolean; tone?: "red" | "green" | "amber" };
  const kpis = (items: Kpi[], cols = 4, small = false) => {
    const gap = 3, w = (CW - gap * (cols - 1)) / cols, h = small ? 15 : 19;
    for (let r = 0; r < items.length; r += cols) {
      ensure(h + 3);
      items.slice(r, r + cols).forEach((it, i) => {
        const x = M + i * (w + gap);
        fill(hex("#fafafa"));
        draw(C.line);
        doc.setLineWidth(0.2);
        doc.roundedRect(x, y, w, h, 1.6, 1.6, "FD");
        let deltaTxt = "";
        let deltaColor = C.muted;
        if (it.delta !== undefined) {
          if (it.delta === null) deltaTxt = "novo";
          else {
            deltaTxt = `${it.delta > 0 ? "+" : ""}${pctFmt(it.delta)}`;
            const good = it.invert ? it.delta < 0 : it.delta > 0;
            deltaColor = it.neutral || Math.abs(it.delta) < 0.0005 ? C.muted : good ? hex(K.purchases) : hex(K.losses);
          }
        }
        font(6.6, "bold", deltaColor);
        const dw = deltaTxt ? doc.getTextWidth(s(deltaTxt)) + 2 : 0;
        if (deltaTxt) text(deltaTxt, x + w - 3, y + 5, "right");
        font(6.5, "normal", C.muted);
        text(fit(it.label.toUpperCase(), w - 6 - dw), x + 3, y + 5);
        const tone = it.tone === "red" ? hex(K.losses) : it.tone === "green" ? hex(K.purchases) : it.tone === "amber" ? hex("#d97706") : C.ink;
        font(small ? 9.5 : 11.5, "bold", tone);
        text(fit(it.value, w - 6), x + 3, y + (small ? 10.5 : 11.8));
        if (it.sub && !small) {
          font(6.4, "normal", C.muted);
          text(fit(it.sub, w - 6), x + 3, y + 16.2);
        }
      });
      y += h + 3;
    }
    y += 1;
  };

  const table = (
    head: string[],
    body: (string | number)[][],
    o: { align?: Align[]; foot?: (string | number)[]; empty?: string; widths?: Record<number, number>; size?: number } = {}
  ) => {
    ensure(18);
    const columnStyles: Record<number, { halign?: Align; cellWidth?: number }> = {};
    (o.align ?? []).forEach((a, i) => (columnStyles[i] = { halign: a }));
    Object.entries(o.widths ?? {}).forEach(([k, v]) => (columnStyles[Number(k)] = { ...(columnStyles[Number(k)] ?? {}), cellWidth: v }));
    const size = o.size ?? 7.4;
    const rows = body.length
      ? body.map((r) => r.map((c) => s(c)))
      : [[{ content: s(o.empty ?? "Sem dados no período."), colSpan: head.length, styles: { halign: "center", textColor: C.muted } }]];
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: TOP, bottom: 20 },
      head: [head.map((h) => s(h))],
      body: rows as unknown as string[][],
      foot: o.foot ? [o.foot.map((c) => s(c))] : undefined,
      theme: "plain",
      styles: { font: "helvetica", fontSize: size, cellPadding: { top: 1.5, bottom: 1.5, left: 1.8, right: 1.8 }, textColor: C.text, lineColor: C.line, lineWidth: { bottom: 0.15 }, overflow: "linebreak", valign: "middle" },
      headStyles: { fillColor: C.ink, textColor: C.white, fontStyle: "bold", fontSize: size - 0.4 },
      footStyles: { fillColor: C.soft, textColor: C.ink, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles,
      showHead: "everyPage",
      showFoot: "lastPage",
    });
    y = lastY() + 6;
  };

  const grid = (px: number, py: number, pw: number, ph: number, max: number, fmt: (n: number) => string) => {
    doc.setLineWidth(0.15);
    for (let i = 0; i <= 4; i++) {
      const yy = py + ph - (i / 4) * ph;
      draw(i === 0 ? hex("#d4d4d8") : C.line);
      if (i > 0) doc.setLineDashPattern([0.8, 0.8], 0);
      doc.line(px, yy, px + pw, yy);
      doc.setLineDashPattern([], 0);
      font(5.8, "normal", C.muted);
      text(fmt((max * i) / 4), px - 1.5, yy + 1, "right");
    }
  };
  const xLabels = (labels: string[], xOf: (i: number) => number, yy: number, maxW: number) => {
    const step = Math.max(1, Math.ceil(labels.length / 12));
    font(5.7, "normal", C.muted);
    labels.forEach((l, i) => {
      if (i % step === 0 || i === labels.length - 1) text(fit(l, maxW * step), xOf(i), yy, "center");
    });
  };
  const legend = (items: { label: string; color: string; dashed?: boolean }[]) => {
    let x = M + 17;
    font(6.6, "normal", C.text);
    items.forEach((it) => {
      fill(hex(it.color.slice(0, 7)));
      doc.rect(x, y - 2.2, 3, 2.2, "F");
      text(it.label, x + 4.2, y);
      x += 4.2 + doc.getTextWidth(s(it.label)) + 6;
    });
    y += 5;
  };

  const barChart = (
    labels: string[],
    series: { values: number[]; color: string; label: string }[],
    o: { h?: number; stacked?: boolean; fmt?: (n: number) => string; overlay?: { values: number[]; color: string; label: string }; legend?: boolean } = {}
  ) => {
    const h = o.h ?? 54;
    ensure(h + 10);
    const fmt = o.fmt ?? moneyShort;
    const px = M + 17, pw = CW - 17 - (o.overlay ? 10 : 2), py = y + 2, ph = h - 10;
    const n = labels.length;
    const totals = labels.map((_, i) =>
      o.stacked ? series.reduce((a, se) => a + Math.max(0, se.values[i] ?? 0), 0) : Math.max(0, ...series.map((se) => se.values[i] ?? 0))
    );
    const max = niceMax(Math.max(0, ...totals));
    grid(px, py, pw, ph, max, fmt);
    const bw = n ? pw / n : pw;
    const gw = Math.min(bw * 0.7, 14);
    labels.forEach((_, i) => {
      const cx = px + i * bw + bw / 2;
      if (o.stacked) {
        let acc = 0;
        series.forEach((se) => {
          const v = Math.max(0, se.values[i] ?? 0);
          if (v <= 0) return;
          const hh = (v / max) * ph;
          fill(hex(se.color));
          doc.rect(cx - gw / 2, py + ph - ((acc + v) / max) * ph, gw, Math.max(0.2, hh), "F");
          acc += v;
        });
      } else {
        const each = gw / series.length;
        series.forEach((se, si) => {
          const v = Math.max(0, se.values[i] ?? 0);
          if (v <= 0) return;
          const hh = (v / max) * ph;
          fill(hex(se.color));
          doc.rect(cx - gw / 2 + si * each, py + ph - hh, Math.max(0.3, each - 0.4), Math.max(0.2, hh), "F");
        });
      }
    });
    if (o.overlay) {
      draw(hex(o.overlay.color));
      doc.setLineWidth(0.5);
      const oy = (v: number) => py + ph - Math.max(0, Math.min(1, v)) * ph;
      o.overlay.values.forEach((v, i) => {
        if (i === 0) return;
        doc.line(px + (i - 1) * bw + bw / 2, oy(o.overlay!.values[i - 1]), px + i * bw + bw / 2, oy(v));
      });
      font(5.8, "normal", C.muted);
      for (let i = 0; i <= 4; i++) text(`${i * 25}%`, px + pw + 1.5, py + ph - (i / 4) * ph + 1);
    }
    xLabels(labels, (i) => px + i * bw + bw / 2, py + ph + 4, bw);
    y += h - 2;
    if (o.legend !== false && (series.length > 1 || o.overlay)) legend([...series, ...(o.overlay ? [o.overlay] : [])]);
    y += 2;
  };

  const lineChart = (
    labels: string[],
    series: { values: (number | null)[]; color: string; label: string; dashed?: boolean; width?: number }[],
    o: { h?: number; fmt?: (n: number) => string; band?: { low: (number | null)[]; high: (number | null)[]; color: string }; divider?: number } = {}
  ) => {
    const h = o.h ?? 60;
    ensure(h + 10);
    const fmt = o.fmt ?? moneyShort;
    const px = M + 17, pw = CW - 19, py = y + 2, ph = h - 10;
    const n = labels.length;
    const vals = [...series.flatMap((se) => se.values), ...(o.band?.high ?? [])].filter((v): v is number => typeof v === "number");
    const max = niceMax(Math.max(0, ...vals));
    const xOf = (i: number) => px + (n <= 1 ? pw / 2 : (i * pw) / (n - 1));
    const yOf = (v: number) => py + ph - (Math.max(0, v) / max) * ph;
    grid(px, py, pw, ph, max, fmt);
    if (o.band) {
      fill(tint(o.band.color, 0.2));
      let run: number[] = [];
      const flush = () => {
        if (run.length > 1) {
          const hi = run.map((i) => [xOf(i), yOf(o.band!.high[i] ?? 0)] as [number, number]);
          const lo = run.map((i) => [xOf(i), yOf(o.band!.low[i] ?? 0)] as [number, number]).reverse();
          poly([...hi, ...lo]);
        }
        run = [];
      };
      labels.forEach((_, i) => (o.band!.low[i] != null && o.band!.high[i] != null ? run.push(i) : flush()));
      flush();
    }
    if (o.divider && o.divider > 0 && o.divider < n) {
      draw(hex("#a1a1aa"));
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([1, 1], 0);
      doc.line(xOf(o.divider), py, xOf(o.divider), py + ph);
      doc.setLineDashPattern([], 0);
      font(6, "normal", C.muted);
      text("Projeção", xOf(o.divider) + 1.5, py + 3);
    }
    series.forEach((se) => {
      draw(hex(se.color));
      doc.setLineWidth(se.width ?? 0.55);
      doc.setLineDashPattern(se.dashed ? [1.4, 1] : [], 0);
      for (let i = 1; i < n; i++) {
        const a = se.values[i - 1];
        const b = se.values[i];
        if (a != null && b != null) doc.line(xOf(i - 1), yOf(a), xOf(i), yOf(b));
      }
      doc.setLineDashPattern([], 0);
    });
    xLabels(labels, xOf, py + ph + 4, n > 1 ? pw / (n - 1) : pw);
    y += h - 2;
    legend(series);
    y += 2;
  };

  const hbars = (rows: { label: string; value: number; sub?: string; color?: string }[], fmt: (n: number) => string, color = K.sky) => {
    if (!rows.length) {
      ensure(8);
      font(7.8, "normal", C.muted);
      text("Sem dados no período.", M, y + 4);
      y += 9;
      return;
    }
    const max = Math.max(0, ...rows.map((r) => r.value));
    const labelW = 56, valueW = 44, barX = M + labelW + 2, barW = CW - labelW - valueW - 4;
    rows.forEach((r) => {
      ensure(7);
      font(7.4, "normal", C.ink);
      text(fit(r.label, labelW), M, y + 3.6);
      fill(C.soft);
      doc.roundedRect(barX, y + 1.3, barW, 2.8, 1.4, 1.4, "F");
      const w = max > 0 ? Math.max(0.8, (r.value / max) * barW) : 0;
      if (w > 0) {
        fill(hex(r.color ?? color));
        doc.roundedRect(barX, y + 1.3, w, 2.8, 1.4, 1.4, "F");
      }
      font(7.3, "bold", C.ink);
      const vt = s(fmt(r.value));
      text(vt, M + CW, y + 3.6, "right");
      if (r.sub) {
        const vw = doc.getTextWidth(vt);
        font(6.3, "normal", C.muted);
        text(r.sub, M + CW - vw - 2, y + 3.6, "right");
      }
      y += 6.3;
    });
    y += 3;
  };

  const heatmap = (matrix: number[][]) => {
    const rowsH = 7 * 4.4 + 8;
    ensure(rowsH);
    const lx = M + 10, cw = (CW - 10) / 24, ch = 3.6;
    const max = Math.max(0, ...matrix.flat());
    font(5.4, "normal", C.muted);
    for (let h = 0; h < 24; h += 3) text(`${h}h`, lx + h * cw + cw / 2, y + 2.5, "center");
    y += 4;
    [1, 2, 3, 4, 5, 6, 0].forEach((dow) => {
      font(6, "normal", C.muted);
      text(WEEKDAYS[dow], M, y + 2.7);
      matrix[dow].forEach((v, h) => {
        fill(v > 0 ? tint(K.sky, 0.18 + 0.82 * (v / (max || 1))) : C.soft);
        doc.roundedRect(lx + h * cw + 0.3, y, cw - 0.6, ch, 0.6, 0.6, "F");
      });
      y += ch + 0.8;
    });
    y += 4;
  };

  const insights = () => {
    const col = { bad: K.losses, warn: "#d97706", good: K.purchases, info: K.sky };
    d.insights.forEach((i) => {
      font(7.6, "normal", C.text);
      const lines = doc.splitTextToSize(s(i.text), CW - 8) as string[];
      const h = 5 + lines.length * 3.4 + 2;
      ensure(h);
      fill(hex(col[i.tone]));
      doc.circle(M + 1.8, y + 2.6, 1.3, "F");
      font(8.4, "bold", C.ink);
      text(i.title, M + 6, y + 3.6);
      font(7.6, "normal", C.text);
      doc.text(lines, M + 6, y + 7.6);
      y += h + 1.5;
    });
  };

  /* ============================================================ capa */
  fill(hex("#0b0b0d"));
  doc.rect(0, 0, PW, 96, "F");
  fill(C.white);
  doc.roundedRect(M, 20, 14, 14, 2.5, 2.5, "F");
  font(10, "bold", C.ink);
  text(initials(d.restaurantName) || "SD", M + 7, 29, "center");
  font(7.5, "bold", hex("#a1a1aa"));
  text("CONTROLE DE ESTOQUE", M + 18, 25.5);
  font(11, "bold", C.white);
  text(d.restaurantName, M + 18, 31.5);
  font(24, "bold", C.white);
  text("Relatório gerencial de estoque", M, 58);
  font(11, "normal", hex("#d4d4d8"));
  text(`${period} · ${f.days} dia(s)`, M, 67);
  font(8.2, "normal", hex("#a1a1aa"));
  text(`Comparado com ${fmtDay(f.prevFrom)} a ${fmtDay(f.prevTo)} · Gerado em ${generated}`, M, 74);
  y = 106;
  sub("Parâmetros do relatório");
  kpis(
    [
      { label: "Período", value: period },
      { label: "Local", value: f.locationName ?? "Todos os locais" },
      { label: "Categoria", value: f.categoryName ?? "Todas as categorias" },
      { label: "Agrupamento", value: `Por ${bn}` },
      { label: "Meta de cobertura", value: `${f.targetDays} dias` },
      { label: "Horizonte de projeção", value: `${f.horizon} dias` },
    ],
    3,
    true
  );
  sub("Conteúdo");
  const tocY = y;
  const tocTitles = ["Resumo executivo", ...sections.map((id) => SECTIONS.find((x) => x.id === id)?.label ?? id)];
  y += tocTitles.length * 6.2 + 4;
  font(7.4, "normal", C.muted);
  const note = doc.splitTextToSize(
    s("Valores monetários calculados pelo custo informado em cada movimentação ou, na falta, pelo custo médio cadastrado do item. Empréstimos entre restaurantes não entram como compra ou consumo. Projeções assumem o ritmo do período analisado."),
    CW
  ) as string[];
  doc.text(note, M, Math.max(y + 4, BOTTOM - note.length * 3.4 - 2));

  /* ============================================================ resumo executivo */
  const k = d.kpis;
  const p = d.prev;
  sectionHeader(0, "Resumo executivo", "Principais indicadores do período e leitura automática dos desvios mais relevantes.");
  kpis([
    { label: "Compras", value: money(k.purchases), delta: pctChange(k.purchases, p.purchases), neutral: true, sub: `${k.purchasesCount} recebimento(s)` },
    { label: "Consumo", value: money(k.consumption), delta: pctChange(k.consumption, p.consumption), invert: true, sub: `${money(k.avgDailyConsumption)}/dia` },
    { label: "Perdas", value: money(k.losses), delta: pctChange(k.losses, p.losses), invert: true, sub: `taxa ${pctFmt(k.lossRate)}`, tone: k.lossRate >= 0.05 ? "red" : undefined },
    { label: "Valor em estoque", value: money(d.stock.value), sub: `${d.stock.withStock} de ${d.stock.items} itens com saldo` },
    { label: "Giro anualizado", value: d.stock.turnoverAnnual === null ? "-" : `${dec(d.stock.turnoverAnnual)}x`, sub: "saídas / estoque" },
    { label: "Cobertura (DIO)", value: daysFmt(d.stock.dio), sub: "dias de estoque" },
    { label: "Rupturas", value: int(d.stock.ruptures), sub: `${d.stock.belowMin} abaixo do mínimo`, tone: d.stock.ruptures > 0 ? "red" : "green" },
    { label: "Necessidade de compra", value: money(d.forecast.purchaseNeed), sub: `meta ${f.targetDays} dias` },
  ]);
  sub("Evolução financeira", `Compras, consumo e perdas por ${bn}`);
  lineChart(
    d.series.map((r) => r.label),
    [
      { values: d.series.map((r) => r.purchases), color: K.purchases, label: "Compras" },
      { values: d.series.map((r) => r.consumption), color: K.consumption, label: "Consumo" },
      { values: d.series.map((r) => r.losses), color: K.losses, label: "Perdas" },
    ],
    { h: 58 }
  );
  sub("Destaques do período");
  insights();

  /* ============================================================ seções */
  const sectionTitle = (id: SectionId) => SECTIONS.find((x) => x.id === id)?.label ?? id;
  const itemsByCov = [...d.items].sort(byCoverage);

  sections.forEach((id, idx) => {
    const n = idx + 1;
    if (id === "overview") {
      sectionHeader(n, sectionTitle(id), `${period} comparado com ${fmtDay(f.prevFrom)} a ${fmtDay(f.prevTo)}.`);
      kpis([
        { label: "Compras", value: money(k.purchases), delta: pctChange(k.purchases, p.purchases), neutral: true, sub: `${k.purchasesCount} recebimento(s)` },
        { label: "Consumo", value: money(k.consumption), delta: pctChange(k.consumption, p.consumption), invert: true, sub: `${money(k.avgDailyConsumption)}/dia` },
        { label: "Perdas", value: money(k.losses), delta: pctChange(k.losses, p.losses), invert: true, sub: `taxa ${pctFmt(k.lossRate)}` },
        { label: "Movimentações", value: int(k.movementsCount), delta: pctChange(k.movementsCount, p.movementsCount), neutral: true, sub: `${k.entradasCount} ent. / ${k.saidasCount} saí. / ${k.transfersCount} transf.` },
      ]);
      sub("Consumo por categoria");
      const totC = d.categories.reduce((a, c) => a + c.consumption, 0);
      hbars(d.categories.filter((c) => c.consumption > 0).map((c) => ({ label: c.name, value: c.consumption, sub: pctFmt(totC > 0 ? c.consumption / totC : 0), color: c.color })), money);
      sub("Comparativo com o período anterior");
      const rows: [string, number, number, (n: number) => string, boolean?][] = [
        ["Compras", k.purchases, p.purchases, money],
        ["Consumo", k.consumption, p.consumption, money],
        ["Perdas", k.losses, p.losses, money],
        ["Taxa de perda", k.lossRate, p.lossRate, (x) => pctFmt(x), true],
        ["Consumo médio diário", k.avgDailyConsumption, p.avgDailyConsumption, money],
        ["Ticket médio de compra", k.avgTicket, p.avgTicket, money],
        ["Ajustes de inventário (líquido)", k.adjustNet, p.adjustNet, money],
        ["Itens consumidos", k.itemsConsumed, p.itemsConsumed, int],
        ["Movimentações", k.movementsCount, p.movementsCount, int],
      ];
      table(
        ["Indicador", "Período atual", "Período anterior", "Diferença", "Variação"],
        rows.map(([l, c, pr, fm, pp]) => [l, fm(c), fm(pr), pp ? `${dec((c - pr) * 100)} p.p.` : fm(c - pr), pp ? "-" : signedPct(pctChange(c, pr))]),
        { align: ["left", "right", "right", "right", "right"] }
      );
    }

    if (id === "consumo") {
      sectionHeader(n, sectionTitle(id), "Saídas operacionais (consumo de cozinha, delivery e uso) e perdas, com Curva ABC e sazonalidade semanal.");
      const aRows = d.abc.filter((r) => r.cls === "A");
      kpis([
        { label: "Consumo", value: money(k.consumption), delta: pctChange(k.consumption, p.consumption), invert: true },
        { label: "Média diária", value: money(k.avgDailyConsumption), delta: pctChange(k.avgDailyConsumption, p.avgDailyConsumption), invert: true },
        { label: "Itens consumidos", value: int(k.itemsConsumed), delta: pctChange(k.itemsConsumed, p.itemsConsumed), neutral: true },
        { label: "Classe A", value: `${aRows.length} itens`, sub: `${pctFmt(aRows.reduce((a, r) => a + r.share, 0))} do valor` },
      ]);
      sub("Consumo e perdas por período", `Valor por ${bn}`);
      barChart(d.series.map((r) => r.label), [
        { values: d.series.map((r) => r.consumption), color: K.consumption, label: "Consumo" },
        { values: d.series.map((r) => r.losses), color: K.losses, label: "Perdas" },
      ], { stacked: true });
      sub("Curva ABC — top 15", "Barras = valor das saídas · linha = % acumulado");
      const top = d.abc.slice(0, 15);
      barChart(top.map((r) => r.name), [{ values: top.map((r) => r.value), color: K.sky, label: "Valor" }], { overlay: { values: top.map((r) => r.cumShare), color: K.consumption, label: "% acumulado" } });
      sub("Consumo médio por dia da semana");
      barChart(d.weekday.map((w) => w.label), [{ values: d.weekday.map((w) => w.avg), color: K.violet, label: "Média" }], { h: 44 });
      sub("Curva ABC — detalhamento");
      table(["Classe", "Item", "Quantidade", "Valor", "Particip.", "Acumulado"], d.abc.map((r) => [r.cls, r.name, `${qty(r.qty)} ${r.unit}`, money(r.value), pctFmt(r.share), pctFmt(r.cumShare)]), { align: ["center", "left", "right", "right", "right", "right"], widths: { 0: 14 } });
      sub("Categorias");
      const totC = d.categories.reduce((a, c) => a + c.consumption, 0);
      table(
        ["Categoria", "Consumo", "Perdas", "Compras", "% consumo", "Estoque (R$)", "Itens"],
        d.categories.map((c) => [c.name, money(c.consumption), money(c.losses), money(c.purchases), pctFmt(totC > 0 ? c.consumption / totC : 0), money(c.stockValue), c.items]),
        { align: ["left", "right", "right", "right", "right", "right", "right"], foot: ["Total", money(totC), money(d.categories.reduce((a, c) => a + c.losses, 0)), money(d.categories.reduce((a, c) => a + c.purchases, 0)), "100%", money(d.categories.reduce((a, c) => a + c.stockValue, 0)), d.categories.reduce((a, c) => a + c.items, 0)] }
      );
    }

    if (id === "estoque") {
      const st = d.stock;
      sectionHeader(n, sectionTitle(id), "Posição atual do estoque, cobertura por item e capital imobilizado. Cobertura = saldo / saída média diária do período.");
      kpis([
        { label: "Valor em estoque", value: money(st.value), sub: `${qty(st.qty)} un.` },
        { label: "Itens com saldo", value: `${st.withStock} / ${st.items}` },
        { label: "Abaixo do mínimo", value: int(st.belowMin), tone: st.belowMin > 0 ? "amber" : "green" },
        { label: "Rupturas", value: int(st.ruptures), tone: st.ruptures > 0 ? "red" : "green" },
        { label: "Estoque parado", value: money(st.stagnantValue), sub: `${st.stagnantCount} item(ns)` },
        { label: "Giro no período", value: st.turnover === null ? "-" : `${dec(st.turnover, 2)}x`, sub: st.turnoverAnnual === null ? "" : `${dec(st.turnoverAnnual)}x ao ano` },
        { label: "Cobertura média", value: daysFmt(st.dio) },
        { label: "Meta de cobertura", value: `${f.targetDays} dias` },
      ]);
      sub("Valor por local");
      hbars(d.locations.map((l) => ({ label: l.name, value: l.stockValue, sub: `${l.skus} SKU(s)` })), money);
      sub("Valor por categoria");
      hbars(d.categories.filter((c) => c.stockValue > 0).map((c) => ({ label: c.name, value: c.stockValue, color: c.color })), money, K.violet);
      sub("Saúde do estoque");
      const stList = Object.keys(STATUS_LABEL) as ItemMetric["status"][];
      hbars(stList.map((x) => ({ label: STATUS_LABEL[x], value: d.items.filter((i) => i.status === x).length, color: STATUS_HEX[x] })), (v) => `${int(v)} item(ns)`);
      sub("Posição e cobertura por item");
      table(
        ["Item", "Categoria", "Saldo", "Mín.", "Saída/dia", "Cobertura", "Acaba em", "Valor", "Status"],
        itemsByCov.map((i) => [i.name, i.category ?? "-", `${qty(i.stock)} ${i.unit}`, i.min > 0 ? qty(i.min) : "-", i.avgDaily > 0 ? qty(Math.round(i.avgDaily * 1000) / 1000) : "-", daysFmt(i.coverageDays), i.status === "ruptura" ? "zerado" : fmtDay(i.ruptureDate), money(i.stockValue), STATUS_LABEL[i.status]]),
        { align: ["left", "left", "right", "right", "right", "right", "right", "right", "left"], size: 6.7 }
      );
      sub("Estoque parado", "Itens com saldo e nenhuma saída no período");
      const stg = d.items.filter((i) => i.status === "parado").sort((a, b) => b.stockValue - a.stockValue);
      table(["Item", "Saldo", "Valor imobilizado", "Última movimentação"], stg.map((i) => [i.name, `${qty(i.stock)} ${i.unit}`, money(i.stockValue), fmtDay(i.lastMove)]), {
        align: ["left", "right", "right", "right"],
        empty: "Nenhum item parado no período.",
        foot: stg.length ? ["Total", "", money(stg.reduce((a, i) => a + i.stockValue, 0)), ""] : undefined,
      });
    }

    if (id === "compras") {
      sectionHeader(n, sectionTitle(id), "Recebimentos confirmados (sem ajustes de inventário e empréstimos), fornecedores e evolução do custo unitário.");
      kpis([
        { label: "Total comprado", value: money(k.purchases), delta: pctChange(k.purchases, p.purchases), neutral: true },
        { label: "Recebimentos", value: int(k.purchasesCount), delta: pctChange(k.purchasesCount, p.purchasesCount), neutral: true },
        { label: "Ticket médio", value: money(k.avgTicket), delta: pctChange(k.avgTicket, p.avgTicket), neutral: true },
        { label: "Fornecedores", value: int(d.suppliers.length) },
      ]);
      sub("Compras por período");
      barChart(d.series.map((r) => r.label), [{ values: d.series.map((r) => r.purchases), color: K.purchases, label: "Compras" }]);
      sub("Principais fornecedores");
      hbars(d.suppliers.slice(0, 10).map((x) => ({ label: x.name, value: x.value, sub: pctFmt(x.share) })), money, K.purchases);
      sub("Fornecedores");
      table(["Fornecedor", "Valor", "Particip.", "Receb.", "Ticket médio", "Itens", "Última"], d.suppliers.map((x) => [x.name, money(x.value), pctFmt(x.share), x.movements, money(x.avgTicket), x.items, fmtDay(x.lastDate)]), {
        align: ["left", "right", "right", "right", "right", "right", "right"],
        empty: "Nenhuma compra no período.",
        foot: d.suppliers.length ? ["Total", money(k.purchases), "100%", k.purchasesCount, money(k.avgTicket), "", ""] : undefined,
      });
      sub("Variação de custo por item", "Custo unitário informado nas entradas do período");
      const priced = d.items.filter((i) => i.price).sort((a, b) => (b.price!.variation ?? -Infinity) - (a.price!.variation ?? -Infinity));
      table(["Item", "Compras", "Primeiro", "Último", "Mínimo", "Máximo", "Médio pond.", "Variação"], priced.map((i) => [i.name, i.price!.buys, money(i.price!.first), money(i.price!.last), money(i.price!.min), money(i.price!.max), money(i.price!.avg), signedPct(i.price!.variation)]), {
        align: ["left", "right", "right", "right", "right", "right", "right", "right"],
        empty: "Nenhuma entrada com custo informado no período.",
        size: 7,
      });
    }

    if (id === "perdas") {
      const exp = d.expiry.buckets;
      sectionHeader(n, sectionTitle(id), "Baixas por perda, vencimento e avaria, e lotes com validade nos próximos 90 dias.");
      kpis([
        { label: "Perdas", value: money(k.losses), delta: pctChange(k.losses, p.losses), invert: true, tone: k.losses > 0 ? "red" : "green" },
        { label: "Taxa de perda", value: pctFmt(k.lossRate), sub: `${dec((k.lossRate - p.lossRate) * 100)} p.p. vs anterior` },
        { label: "Lotes vencidos", value: money(exp[0].value), sub: `${exp[0].count} lote(s)`, tone: exp[0].count > 0 ? "red" : "green" },
        { label: "Vencendo em 30 dias", value: money(exp.slice(1, 4).reduce((a, b) => a + b.value, 0)), sub: `${exp.slice(1, 4).reduce((a, b) => a + b.count, 0)} lote(s)` },
      ]);
      sub("Perdas por motivo");
      hbars(d.losses.byReason.map((r) => ({ label: r.reason, value: r.value, sub: `${r.count} baixa(s)` })), money, K.losses);
      sub("Perdas por período");
      barChart(d.series.map((r) => r.label), [{ values: d.series.map((r) => r.losses), color: K.losses, label: "Perdas" }], { h: 46 });
      sub("Itens com maior perda");
      table(["Item", "Motivo principal", "Quantidade", "Valor", "% das perdas"], d.losses.topItems.map((i) => [i.name, i.reason, `${qty(i.qty)} ${i.unit}`, money(i.value), pctFmt(k.losses > 0 ? i.value / k.losses : 0)]), { align: ["left", "left", "right", "right", "right"], empty: "Nenhuma perda registrada no período." });
      sub("Validade dos lotes", "Valor em risco limitado ao saldo atual do item");
      const tc = { bad: K.losses, warn: K.consumption, info: K.sky };
      hbars(exp.map((b) => ({ label: b.label, value: b.value, sub: `${b.count} lote(s)`, color: tc[b.tone] })), money);
      sub("Lotes a vencer");
      table(["Item", "Lote", "Local", "Validade", "Dias", "Recebido", "Em risco", "Valor"], d.expiry.lots.map((l) => [l.item, l.lot ?? "-", l.location ?? "-", fmtDay(l.expiry), l.days < 0 ? `vencido ${-l.days}d` : l.days, `${qty(l.qty)} ${l.unit}`, `${qty(l.risk)} ${l.unit}`, money(l.value)]), {
        align: ["left", "left", "left", "right", "right", "right", "right", "right"],
        empty: "Nenhum lote vencendo nos próximos 90 dias.",
        size: 7,
      });
    }

    if (id === "movimentacao") {
      sectionHeader(n, sectionTitle(id), "Volume de documentos, horários de lançamento, fluxo entre locais e ajustes de inventário.");
      kpis([
        { label: "Entradas", value: int(k.entradasCount), delta: pctChange(k.entradasCount, p.entradasCount), neutral: true },
        { label: "Saídas", value: int(k.saidasCount), delta: pctChange(k.saidasCount, p.saidasCount), neutral: true },
        { label: "Transferências", value: int(k.transfersCount), delta: pctChange(k.transfersCount, p.transfersCount), neutral: true },
        { label: "Ajustes (líquido)", value: money(k.adjustNet), sub: `+${money(k.adjustIn)} / -${money(k.adjustOut)}` },
      ]);
      sub("Volume de movimentações", `Documentos por ${bn}`);
      barChart(d.series.map((r) => r.label), [
        { values: d.series.map((r) => r.entradas), color: K.purchases, label: "Entradas" },
        { values: d.series.map((r) => r.saidas), color: K.consumption, label: "Saídas" },
        { values: d.series.map((r) => r.transferencias), color: K.sky, label: "Transferências" },
      ], { stacked: true, fmt: (v) => int(v) });
      sub("Quando a equipe registra", "Movimentações por dia da semana e hora do lançamento");
      heatmap(d.heatmap);
      sub("Fluxo por local");
      table(["Local", "Estoque", "SKUs", "Entrou", "Saiu"], d.locations.map((l) => [l.name, money(l.stockValue), l.skus, money(l.inValue), money(l.outValue)]), { align: ["left", "right", "right", "right", "right"] });
      sub("Transferências entre locais");
      table(["Origem -> destino", "Qtde.", "Unidades", "Valor"], d.transfers.map((t) => [`${t.from} -> ${t.to}`, t.count, qty(t.qty), money(t.value)]), { align: ["left", "right", "right", "right"], empty: "Nenhuma transferência no período." });
    }

    if (id === "inventario") {
      const inv = d.inventory;
      sectionHeader(n, sectionTitle(id), "Contagens concluídas no período. Acurácia = itens contados sem divergência / itens contados.");
      kpis([
        { label: "Contagens", value: int(inv.counts.length), sub: `${inv.counts.reduce((a, c) => a + c.lines, 0)} itens contados` },
        { label: "Acurácia", value: pctFmt(inv.accuracy), tone: inv.accuracy === null ? undefined : inv.accuracy >= 0.95 ? "green" : inv.accuracy >= 0.85 ? "amber" : "red" },
        { label: "Divergência absoluta", value: money(inv.divergenceValue) },
        { label: "Ajuste líquido", value: money(inv.netValue), tone: inv.netValue < 0 ? "red" : undefined },
      ]);
      if (inv.counts.length) {
        sub("Acurácia por contagem");
        hbars(inv.counts.map((c) => ({ label: `${c.code} · ${c.location}`, value: c.accuracy ?? 0, sub: `${c.exact}/${c.lines}`, color: (c.accuracy ?? 0) >= 0.95 ? K.purchases : (c.accuracy ?? 0) >= 0.85 ? K.consumption : K.losses })), (v) => pctFmt(v));
      }
      sub("Contagens do período");
      table(["Código", "Escopo", "Concluído", "Contados", "Acurácia", "Divergência", "Ajuste líquido"], inv.counts.map((c) => [c.code, c.location, fmtDay(c.finishedAt), c.lines, pctFmt(c.accuracy), money(c.divergenceValue), money(c.netValue)]), {
        align: ["left", "left", "right", "right", "right", "right", "right"],
        empty: "Nenhum inventário concluído no período.",
      });
    }

    if (id === "emprestimos") {
      const l = d.loans;
      sectionHeader(n, sectionTitle(id), "Posição atual dos empréstimos entre restaurantes (valor pendente = quantidade pendente x valor unitário).");
      kpis([
        { label: "A receber", value: money(l.toReceive) },
        { label: "A devolver", value: money(l.toReturn) },
        { label: "Saldo líquido", value: money(l.net), tone: l.net < 0 ? "red" : l.net > 0 ? "green" : undefined },
        { label: "Vencidos", value: money(l.overdueValue), sub: `${l.overdueCount} de ${l.openCount} em aberto`, tone: l.overdueCount > 0 ? "red" : "green" },
        { label: "Criados no período", value: int(l.createdInPeriod) },
        { label: "Quitados no período", value: int(l.settledInPeriod) },
        { label: "Prazo médio de quitação", value: daysFmt(l.avgDaysToSettle) },
        { label: "Em aberto", value: int(l.openCount) },
      ]);
      sub("Aging das pendências");
      barChart(l.aging.map((a) => a.label), [
        { values: l.aging.map((a) => a.receive), color: K.sky, label: "A receber" },
        { values: l.aging.map((a) => a.ret), color: K.violet, label: "A devolver" },
      ], { h: 46 });
      sub("Posição por parceiro");
      table(["Parceiro", "Nos deve", "Devemos", "Abertos", "Vencidos"], l.byPartner.map((x) => [x.partner, money(x.receive), money(x.ret), x.open, x.overdue]), { align: ["left", "right", "right", "right", "right"], empty: "Nenhum empréstimo em aberto." });
      sub("Empréstimos em aberto");
      table(["Código", "Parceiro", "Direção", "Prazo", "Situação", "Pendente"], l.open.map((x) => [x.code, x.partner, x.direction === "emprestamos" ? "A receber" : "A devolver", fmtDay(x.due), x.daysLeft < 0 ? `vencido há ${-x.daysLeft}d` : x.daysLeft === 0 ? "vence hoje" : `faltam ${x.daysLeft}d`, money(x.value)]), {
        align: ["left", "left", "left", "right", "right", "right"],
        empty: "Nenhum empréstimo em aberto.",
      });
    }

    if (id === "projecoes") {
      const fc = d.forecast;
      const methodTxt = fc.method === "regressao" ? "Regressão linear com sazonalidade semanal" : fc.method === "media" ? "Média simples (histórico curto)" : "Histórico insuficiente";
      const horizonEnd = fc.points.length ? fc.points[fc.points.length - 1].date : d.today;
      sectionHeader(n, sectionTitle(id), `Projeção de consumo para os próximos ${f.horizon} dias, previsão de ruptura e sugestão de compra.`);
      kpis([
        { label: `Consumo projetado (${f.horizon}d)`, value: money(fc.total), sub: fc.method === "insuficiente" ? "sem histórico" : `faixa ${moneyShort(fc.low)} - ${moneyShort(fc.high)}` },
        { label: "Tendência", value: fc.trendPctMonth === null ? "-" : `${signedPct(fc.trendPctMonth / 100)}/mês`, sub: methodTxt },
        { label: "Estoque sem compras", value: money(fc.projectedStockValue), sub: `hoje ${money(d.stock.value)}` },
        { label: "Necessidade de compra", value: money(fc.purchaseNeed), sub: `${d.items.filter((i) => i.suggestion > 0).length} item(ns)` },
      ]);
      sub("Projeção de consumo diário", `Histórico (até 90 dias), média móvel 7 dias e projeção com faixa de ~80%${fc.r2 !== null ? ` · R² ${dec(fc.r2, 2)}` : ""}`);
      const hist = fc.history.slice(-90);
      const lastVal = hist.length ? (hist[hist.length - 1].ma7 ?? hist[hist.length - 1].value) : null;
      const labels = [...hist.map((h) => fmtDayShort(h.date)), ...fc.points.map((pt) => fmtDayShort(pt.date))];
      const nh = hist.length;
      lineChart(
        labels,
        [
          { values: [...hist.map((h) => h.value), ...fc.points.map(() => null)], color: K.consumption, label: "Consumo real", width: 0.4 },
          { values: [...hist.map((h) => h.ma7), ...fc.points.map(() => null)], color: K.zinc, label: "Média móvel 7d", dashed: true },
          { values: [...hist.map((_, i) => (i === nh - 1 ? lastVal : null)), ...fc.points.map((pt) => pt.value)], color: K.sky, label: "Projeção", width: 0.8 },
        ],
        { h: 62, band: { low: [...hist.map(() => null), ...fc.points.map((pt) => pt.low)], high: [...hist.map(() => null), ...fc.points.map((pt) => pt.high)], color: K.sky }, divider: nh }
      );
      sub("Sazonalidade semanal", "Fator de cada dia sobre a média (1,0 = dia típico)");
      barChart([1, 2, 3, 4, 5, 6, 0].map((w) => WEEKDAYS[w]), [{ values: [1, 2, 3, 4, 5, 6, 0].map((w) => fc.weekdayFactors[w] ?? 1), color: K.violet, label: "Fator" }], { h: 40, fmt: (v) => `${dec(v, 2)}x` });
      sub("Metodologia");
      paragraph(`${methodTxt}. A série diária de consumo é dessazonalizada por dia da semana (com 14+ dias), ajustada por mínimos quadrados (com 7+ dias) e projetada para ${f.horizon} dias. Faixa provável: +/-1,28 desvio-padrão dos resíduos (~80%); no total, a incerteza cresce com a raiz do número de dias.`);
      paragraph(`Sugestão de compra = saída diária x (meta de ${f.targetDays} dias + prazo de entrega do item) + estoque mínimo - saldo atual. Unidades inteiras são arredondadas para cima. Cobertura e ruptura assumem o ritmo do período e não consideram novas compras.`);
      sub("Sugestão de compra");
      const sug = d.items.filter((i) => i.suggestion > 0).sort((a, b) => b.suggestionValue - a.suggestionValue);
      table(["Item", "Saldo", "Mín.", "Saída/dia", "Entrega", "Cobertura", "Comprar", "Custo est."], sug.map((i) => [i.name, `${qty(i.stock)} ${i.unit}`, i.min > 0 ? qty(i.min) : "-", i.avgDaily > 0 ? qty(Math.round(i.avgDaily * 1000) / 1000) : "-", i.leadTime > 0 ? `${i.leadTime}d` : "-", daysFmt(i.coverageDays), `${qty(i.suggestion)} ${i.unit}`, money(i.suggestionValue)]), {
        align: ["left", "right", "right", "right", "right", "right", "right", "right"],
        empty: "Nenhuma compra necessária para a meta de cobertura.",
        foot: sug.length ? ["Total estimado", "", "", "", "", "", "", money(fc.purchaseNeed)] : undefined,
        size: 7,
      });
      sub("Previsão de ruptura", `Itens zerados ou que acabam até ${fmtDay(horizonEnd)} no ritmo atual`);
      const rup = d.items.filter((i) => i.status === "ruptura" || (i.ruptureDate !== null && i.ruptureDate <= horizonEnd)).sort(byCoverage);
      table(["Item", "Saldo", "Saída/dia", "Acaba em", "Data prevista", "Status"], rup.map((i) => [i.name, `${qty(i.stock)} ${i.unit}`, i.avgDaily > 0 ? qty(Math.round(i.avgDaily * 1000) / 1000) : "-", i.status === "ruptura" ? "já zerado" : daysFmt(i.coverageDays), i.status === "ruptura" ? "-" : fmtDay(i.ruptureDate), STATUS_LABEL[i.status]]), {
        align: ["left", "right", "right", "right", "right", "left"],
        empty: "Nenhuma ruptura prevista no horizonte.",
      });
    }

    if (id === "extrato") {
      sectionHeader(n, sectionTitle(id), `${d.movementsLog.length} documento(s) confirmados no período.`);
      const total = d.movementsLog.reduce((a, m) => a + m.value, 0);
      table(
        ["Data", "Documento", "Tipo", "Motivo / fornecedor", "Local", "Itens", "Valor"],
        d.movementsLog.map((m) => [fmtDay(m.date), m.code, CLS_LABEL[m.cls], m.supplier || m.reason || "-", m.from && m.to ? `${m.from} -> ${m.to}` : m.to || m.from || "-", m.items, money(m.value)]),
        {
          align: ["left", "left", "left", "left", "left", "right", "right"],
          empty: "Nenhuma movimentação no período.",
          foot: d.movementsLog.length ? ["Total", "", "", "", "", d.movementsLog.reduce((a, m) => a + m.items, 0), money(total)] : undefined,
          size: 6.8,
        }
      );
    }
  });

  /* ============================================================ sumário, cabeçalhos e rodapés */
  doc.setPage(1);
  let ty = tocY;
  toc.forEach((t, i) => {
    font(9, i === 0 ? "bold" : "normal", C.ink);
    text(`${String(i).padStart(2, "0")}   ${tocTitles[i] ?? t.title}`, M, ty + 4);
    draw(C.line);
    doc.setLineWidth(0.15);
    doc.setLineDashPattern([0.6, 0.8], 0);
    const tw = doc.getTextWidth(s(`${String(i).padStart(2, "0")}   ${tocTitles[i] ?? t.title}`));
    doc.line(M + tw + 3, ty + 3.6, M + CW - 12, ty + 3.6);
    doc.setLineDashPattern([], 0);
    font(9, "bold", C.muted);
    text(String(t.page), M + CW, ty + 4, "right");
    ty += 6.2;
  });

  const total = doc.getNumberOfPages();
  for (let pg = 1; pg <= total; pg++) {
    doc.setPage(pg);
    if (pg > 1) {
      const sec = [...sectionStarts].reverse().find((x) => x.page <= pg);
      font(7.4, "bold", C.ink);
      text(d.restaurantName, M, 11);
      font(7.4, "normal", C.muted);
      text(`${sec?.title ?? ""} · ${period}`, M + CW, 11, "right");
      draw(C.line);
      doc.setLineWidth(0.2);
      doc.line(M, 13.5, M + CW, 13.5);
    }
    draw(C.line);
    doc.setLineWidth(0.2);
    doc.line(M, PH - 12, M + CW, PH - 12);
    font(6.8, "normal", C.muted);
    text(`Relatório gerencial de estoque · Gerado em ${generated}`, M, PH - 8);
    text(`Página ${pg} de ${total}`, M + CW, PH - 8, "right");
  }

  if (opts.returnBuffer) return doc.output("arraybuffer");
  doc.save(`relatorio-estoque_${f.from}_${f.to}.pdf`);
}
