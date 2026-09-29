"use client";

import { ArrowUpFromLine } from "lucide-react";
import { MovementPage } from "@/components/MovementPage";

export default function SaidasPage() {
  return (
    <MovementPage
      type="saida"
      breadcrumb="Saídas"
      title="Saída de estoque"
      badge="Consumo e retiradas"
      subtitle="Baixe insumos com validação de saldo, motivo e histórico rastreável por local."
      emptyTitle="Registre a primeira saída"
      emptyDesc="Baixe insumos consumidos, perdas ou vencimentos direto do saldo do local."
      icon={<ArrowUpFromLine className="size-4" />}
    />
  );
}
