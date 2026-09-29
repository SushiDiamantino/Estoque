"use client";

import { ArrowRight } from "lucide-react";
import { MovementPage } from "@/components/MovementPage";

export default function TransferenciasPage() {
  return (
    <MovementPage
      type="transferencia"
      breadcrumb="Transferências"
      title="Transferências"
      badge="Entre locais"
      subtitle="Mova insumos entre locais mantendo o saldo individual de cada espaço."
      emptyTitle="Registre a primeira transferência"
      emptyDesc="Transfira insumos entre locais mantendo o saldo de cada um isolado."
      icon={<ArrowRight className="size-4" />}
    />
  );
}
