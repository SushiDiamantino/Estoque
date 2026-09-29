/**
 * Kit de PDF do sistema — documento A4 com capa curta, cabeçalho, rodapé numerado
 * e tabelas reais (texto selecionável, não captura de tela).
 * Usado por todos os módulos para manter a mesma identidade.
 */

export type RGB = [number, number, number];
export type Align = "left" | "right" | "center";

const hex = (h: string): RGB => {
  const x = h.replace("#", "");
  return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
};

export const PDF_COLORS = {
  ink: hex("#18181b"),
  text: hex("#3f3f46"),
  muted: hex("#71717a"),
  line: hex("#e4e4e7"),
  soft: hex("#f4f4f5"),
  white: [255, 255, 255] as RGB,
  green: hex("#10b981"),
  amber: hex("#d97706"),
  red: hex("#ef4444"),
  sky: hex("#0ea5e9"),
  violet: hex("#8b5cf6"),
};

/** jsPDF usa fontes WinAnsi: converte o que não existe e remove o resto. */
const MAP: Record<string, string> = {
  "—": "-", "–": "-", "→": "->", "←": "<-", "…": "...", "≈": "~", "×": "x",
  "“": '"', "”": '"', "‘": "'", "’": "'", "•": "-", "−": "-", "≥": ">=", "≤": "<=",
  "\u00a0": " ", "\u202f": " ", "√": "raiz ", "±": "+/-", "✓": "OK", "✕": "X", "·": "-",
};
export const sane = (v: unknown) =>
  String(v ?? "")
    .replace(/[—–→←…≈×“”‘’•−≥≤\u00a0\u202f√✓✕·]/g, (ch) => MAP[ch] ?? "")
    .replace(/[^\x00-\xFF]/g, "");

export type KpiCard = { label: string; value: string; sub?: string; tone?: "red" | "green" | "amber" };
export type TableOpts = {
  align?: Align[];
  widths?: Record<number, number>;
  foot?: (string | number)[];
  empty?: string;
  size?: number;
  rowTone?: (rowIndex: number) => "red" | "amber" | "green" | null;
};

export type PdfDoc = {
  title: (text: string, subtitle?: string) => void;
  meta: (pairs: [string, string][]) => void;
  section: (title: string, desc?: string) => void;
  kpis: (items: KpiCard[], cols?: number) => void;
  table: (head: string[], body: (string | number)[][], opts?: TableOpts) => void;
  paragraph: (text: string, size?: number) => void;
  bullets: (items: string[]) => void;
  note: (text: string, tone?: "info" | "warn" | "bad" | "good") => void;
  keyValue: (rows: [string, string][], cols?: number) => void;
  signatures: (labels: string[]) => void;
  spacer: (mm?: number) => void;
  save: (filename: string) => void;
  blob: () => Blob;
  openPrint: () => void;
  y: () => number;
};

export async function createPdf(opts: {
  org: string;
  docTitle: string;
  subtitle?: string;
  orientation?: "portrait" | "landscape";
  footerNote?: string;
}): Promise<PdfDoc> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const landscape = opts.orientation === "landscape";
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: opts.orientation ?? "portrait", compress: true });
  const PW = landscape ? 297 : 210;
  const PH = landscape ? 210 : 297;
  const M = 12;
  const CW = PW - 2 * M;
  const TOP = 26;
  const BOTTOM = PH - 16;
  const C = PDF_COLORS;
  let y = TOP;
  const generated = new Date().toLocaleString("pt-BR");

  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const draw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const font = (size: number, style: "normal" | "bold" = "normal", color: RGB = C.text) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
  };
  const put = (t: unknown, x: number, yy: number, align: Align = "left") => doc.text(sane(t), x, yy, { align });
  const fit = (t: unknown, w: number) => {
    let str = sane(t);
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

  const api: PdfDoc = {
    y: () => y,
    spacer: (mm = 4) => {
      y += mm;
    },
    title: (text, subtitle) => {
      fill(C.ink);
      doc.rect(0, 0, PW, 19, "F");
      font(7, "bold", hex("#a1a1aa"));
      put(opts.org.toUpperCase(), M, 7.5);
      font(11.5, "bold", C.white);
      put(text, M, 14.5);
      font(7.5, "normal", hex("#d4d4d8"));
      put(generated, PW - M, 14.5, "right");
      y = 25;
      if (subtitle) {
        font(8.6, "normal", C.muted);
        const lines = doc.splitTextToSize(sane(subtitle), CW) as string[];
        doc.text(lines, M, y);
        y += lines.length * 3.8 + 2;
      }
    },
    meta: (pairs) => {
      if (!pairs.length) return;
      const per = Math.min(4, pairs.length);
      const gap = 2.5;
      const w = (CW - gap * (per - 1)) / per;
      for (let i = 0; i < pairs.length; i += per) {
        const row = pairs.slice(i, i + per);
        ensure(13);
        row.forEach(([k, v], j) => {
          const x = M + j * (w + gap);
          fill(C.soft);
          draw(C.line);
          doc.setLineWidth(0.2);
          doc.roundedRect(x, y, w, 11, 1.4, 1.4, "FD");
          font(6.2, "normal", C.muted);
          put(fit(k.toUpperCase(), w - 5), x + 2.5, y + 4.2);
          font(8.4, "bold", C.ink);
          put(fit(v, w - 5), x + 2.5, y + 8.6);
        });
        y += 13;
      }
      y += 2;
    },
    section: (title, desc) => {
      ensure(desc ? 16 : 11);
      fill(C.ink);
      doc.rect(M, y, 2.2, 5.4, "F");
      font(10.5, "bold", C.ink);
      put(title, M + 4.5, y + 4.6);
      y += 7.5;
      if (desc) {
        font(7.6, "normal", C.muted);
        const lines = doc.splitTextToSize(sane(desc), CW) as string[];
        doc.text(lines, M, y + 1);
        y += lines.length * 3.4 + 1.5;
      }
      y += 1;
    },
    kpis: (items, cols = 4) => {
      if (!items.length) return;
      const gap = 2.5;
      const w = (CW - gap * (cols - 1)) / cols;
      for (let i = 0; i < items.length; i += cols) {
        const row = items.slice(i, i + cols);
        ensure(19);
        row.forEach((it, j) => {
          const x = M + j * (w + gap);
          fill(hex("#fafafa"));
          draw(C.line);
          doc.setLineWidth(0.2);
          doc.roundedRect(x, y, w, 17, 1.6, 1.6, "FD");
          font(6.3, "normal", C.muted);
          put(fit(it.label.toUpperCase(), w - 5), x + 2.8, y + 4.6);
          const tone = it.tone === "red" ? C.red : it.tone === "green" ? C.green : it.tone === "amber" ? C.amber : C.ink;
          font(11, "bold", tone);
          put(fit(it.value, w - 5), x + 2.8, y + 10.6);
          if (it.sub) {
            font(6.2, "normal", C.muted);
            put(fit(it.sub, w - 5), x + 2.8, y + 14.8);
          }
        });
        y += 19;
      }
      y += 1;
    },
    table: (head, body, o = {}) => {
      ensure(16);
      const columnStyles: Record<number, { halign?: Align; cellWidth?: number }> = {};
      (o.align ?? []).forEach((a, i) => (columnStyles[i] = { halign: a }));
      Object.entries(o.widths ?? {}).forEach(([k, v]) => (columnStyles[Number(k)] = { ...(columnStyles[Number(k)] ?? {}), cellWidth: v }));
      const size = o.size ?? 7.4;
      const rows: unknown[][] = body.length
        ? body.map((r) => r.map((c) => sane(c)))
        : [[{ content: sane(o.empty ?? "Sem registros."), colSpan: head.length, styles: { halign: "center", textColor: C.muted } }]];
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M, top: TOP, bottom: 18 },
        head: [head.map((h) => sane(h))],
        body: rows as string[][],
        foot: o.foot ? [o.foot.map((c) => sane(c))] : undefined,
        theme: "plain",
        styles: {
          font: "helvetica",
          fontSize: size,
          cellPadding: { top: 1.5, bottom: 1.5, left: 1.8, right: 1.8 },
          textColor: C.text,
          lineColor: C.line,
          lineWidth: { bottom: 0.15 },
          overflow: "linebreak",
          valign: "middle",
        },
        headStyles: { fillColor: C.ink, textColor: C.white, fontStyle: "bold", fontSize: size - 0.4 },
        footStyles: { fillColor: C.soft, textColor: C.ink, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles,
        showHead: "everyPage",
        showFoot: o.foot ? "lastPage" : "never",
        didParseCell: (d) => {
          if (d.section !== "body" || !o.rowTone) return;
          const tone = o.rowTone(d.row.index);
          if (!tone) return;
          const map = { red: hex("#fef2f2"), amber: hex("#fffbeb"), green: hex("#f0fdf4") };
          d.cell.styles.fillColor = map[tone];
        },
      });
      y = lastY() + 5;
    },
    paragraph: (text, size = 8) => {
      font(size, "normal", C.text);
      const lines = doc.splitTextToSize(sane(text), CW) as string[];
      ensure(lines.length * size * 0.42 + 2);
      doc.text(lines, M, y + 3);
      y += lines.length * size * 0.42 + 3;
    },
    bullets: (items) => {
      font(8, "normal", C.text);
      for (const it of items) {
        const lines = doc.splitTextToSize(sane(it), CW - 5) as string[];
        ensure(lines.length * 3.6 + 1.5);
        fill(C.muted);
        doc.circle(M + 1.2, y + 2.2, 0.7, "F");
        doc.text(lines, M + 4, y + 3);
        y += lines.length * 3.6 + 1.2;
      }
      y += 2;
    },
    note: (text, tone = "info") => {
      const col = tone === "bad" ? C.red : tone === "warn" ? C.amber : tone === "good" ? C.green : C.sky;
      font(7.8, "normal", C.text);
      const lines = doc.splitTextToSize(sane(text), CW - 8) as string[];
      const h = lines.length * 3.5 + 4;
      ensure(h + 2);
      fill(hex("#fafafa"));
      doc.roundedRect(M, y, CW, h, 1.4, 1.4, "F");
      fill(col);
      doc.rect(M, y, 1.6, h, "F");
      doc.text(lines, M + 4.5, y + 4);
      y += h + 3;
    },
    keyValue: (rows, cols = 2) => {
      const gap = 3;
      const w = (CW - gap * (cols - 1)) / cols;
      for (let i = 0; i < rows.length; i += cols) {
        const row = rows.slice(i, i + cols);
        ensure(9);
        row.forEach(([k, v], j) => {
          const x = M + j * (w + gap);
          font(7, "normal", C.muted);
          put(fit(k, w * 0.45), x, y + 4);
          font(8.2, "bold", C.ink);
          put(fit(v, w * 0.55 - 2), x + w, y + 4, "right");
          draw(C.line);
          doc.setLineWidth(0.15);
          doc.line(x, y + 6, x + w, y + 6);
        });
        y += 9;
      }
      y += 2;
    },
    signatures: (labels) => {
      ensure(26);
      const gap = 8;
      const w = (CW - gap * (labels.length - 1)) / labels.length;
      y += 12;
      labels.forEach((l, i) => {
        const x = M + i * (w + gap);
        draw(C.muted);
        doc.setLineWidth(0.25);
        doc.line(x, y, x + w, y);
        font(7.4, "normal", C.muted);
        put(l, x + w / 2, y + 4.2, "center");
      });
      y += 10;
    },
    save: (filename) => {
      stamp();
      doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
    },
    blob: () => {
      stamp();
      return doc.output("blob");
    },
    openPrint: () => {
      stamp();
      const url = URL.createObjectURL(doc.output("blob"));
      const w = window.open(url, "_blank");
      if (w) w.onload = () => w.print();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  };

  let stamped = false;
  function stamp() {
    if (stamped) return;
    stamped = true;
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      if (p > 1) {
        font(7.2, "bold", C.ink);
        put(opts.org, M, 10);
        font(7.2, "normal", C.muted);
        put(opts.docTitle, PW - M, 10, "right");
        draw(C.line);
        doc.setLineWidth(0.2);
        doc.line(M, 12.5, PW - M, 12.5);
      }
      draw(C.line);
      doc.setLineWidth(0.2);
      doc.line(M, PH - 11, PW - M, PH - 11);
      font(6.6, "normal", C.muted);
      put(opts.footerNote ?? `${opts.docTitle} - gerado em ${generated}`, M, PH - 7);
      put(`Pagina ${p} de ${total}`, PW - M, PH - 7, "right");
    }
  }

  return api;
}
