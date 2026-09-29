"use client";

import { useState } from "react";
import { FileDown, Loader2, Printer } from "lucide-react";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";

/**
 * Botão padrão de PDF: baixa o arquivo ou abre direto na impressão.
 * `build(print)` deve gerar o documento (jsPDF é carregado sob demanda).
 */
export function PdfButton({
  build,
  label = "PDF",
  disabled,
  primary,
  className,
  title = "Gerar PDF",
}: {
  build: (print: boolean) => Promise<void>;
  label?: string;
  disabled?: boolean;
  primary?: boolean;
  className?: string;
  title?: string;
}) {
  const { push } = useToast();
  const [busy, setBusy] = useState<null | "save" | "print">(null);

  const run = async (print: boolean) => {
    if (busy || disabled) return;
    setBusy(print ? "print" : "save");
    try {
      await build(print);
      if (!print) push({ kind: "success", title: "PDF gerado", msg: "O download começou." });
    } catch (e) {
      console.error(e);
      push({ kind: "error", title: "Não foi possível gerar o PDF", msg: "Tente novamente." });
    } finally {
      setBusy(null);
    }
  };

  const base = primary
    ? "bg-zinc-100 text-zinc-950 hover:bg-white"
    : "border border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:text-white";

  return (
    <span className={cn("inline-flex overflow-hidden rounded-lg", primary ? "" : "border-0", className)}>
      <button
        onClick={() => run(false)}
        disabled={disabled || !!busy}
        title={title}
        className={cn(
          "inline-flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium transition disabled:opacity-50",
          base,
          primary ? "rounded-l-lg" : "rounded-l-lg border-r-0"
        )}
      >
        {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
        {label}
      </button>
      <button
        onClick={() => run(true)}
        disabled={disabled || !!busy}
        title="Abrir para impressão"
        aria-label="Imprimir"
        className={cn(
          "inline-flex items-center px-2.5 py-2.5 transition disabled:opacity-50",
          base,
          "rounded-r-lg",
          primary ? "border-l border-zinc-300/60" : "border-l border-white/10"
        )}
      >
        {busy === "print" ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
      </button>
    </span>
  );
}
