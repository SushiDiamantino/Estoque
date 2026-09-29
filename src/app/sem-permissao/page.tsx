"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ShieldAlert, ArrowLeft, Lock } from "lucide-react";

export default function SemPermissaoPage() {
  useEffect(() => {
    document.title = "Acesso não autorizado";
  }, []);
  return (
    <div className="grid min-h-screen place-items-center bg-[#0b0b0d] px-5">
      <div className="w-full max-w-[440px] rounded-2xl border border-white/[0.08] bg-[#141417] p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-300">
          <ShieldAlert className="size-6" />
        </span>
        <h1 className="mt-5 text-[20px] font-bold tracking-tight text-white">Acesso não autorizado</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
          Seu perfil não tem permissão para esta área. Se você precisa desse acesso,
          fale com o Administrador do sistema.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-100 px-4 py-2.5 text-[13.5px] font-semibold text-zinc-950 transition hover:bg-white">
            <ArrowLeft className="size-4" /> Voltar ao início
          </Link>
          <Link href="/alertas" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-[13px] font-medium text-zinc-300 hover:text-white">
            <Lock className="size-4" /> Ir para Alertas
          </Link>
        </div>
      </div>
    </div>
  );
}
