"use client";

import { ArrowDownToLine } from "lucide-react";
import { MovementPage } from "@/components/MovementPage";

export default function EntradasPage() {
  return (
    <MovementPage
      type="entrada"
      breadcrumb="Entradas"
      title="Entrada de mercadorias"
      badge="Recebimentos"
      subtitle="Registre, confira e confirme mercadorias com atualização rastreável por local."
      emptyTitle="Registre o primeiro recebimento"
      emptyDesc="Salve como rascunho durante a conferência e confirme somente quando as mercadorias estiverem corretas."
      icon={<ArrowDownToLine className="size-4" />}
    />
  );
}
