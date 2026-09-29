"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Lock, User as UserIcon, ShieldCheck, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";

export default function LoginPage() {
  const router = useRouter();
  const { push } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstAccess, setFirstAccess] = useState(false);

  useEffect(() => {
    api<{ user: unknown }>("/api/auth/me").then((r) => {
      if (r.ok && r.data.user) router.replace("/");
    });
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!username.trim() || !password) {
      setError("Informe usuário e senha.");
      return;
    }
    setBusy(true);
    const r = await api<{ mustChangePassword?: boolean; firstAccess?: boolean; user?: { name: string } }>("/api/auth/login", {
      method: "POST",
      json: { username, password },
    });
    setBusy(false);
    if (r.ok) {
      push({ kind: "success", title: `Bem-vindo, ${r.data.user?.name ?? "Operador"}` });
      if (r.data.mustChangePassword) {
        setFirstAccess(Boolean(r.data.firstAccess));
        router.replace("/alterar-senha");
      } else {
        router.replace("/");
      }
      router.refresh();
    } else {
      setError(r.error ?? "Não foi possível entrar.");
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#0b0b0d] px-5 py-10">
      <div className="w-full max-w-[400px]">
        <div className="flex flex-col items-center text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-zinc-100 text-[18px] font-black tracking-tight text-zinc-950">
            SD
          </div>
          <h1 className="mt-5 text-[22px] font-bold tracking-tight text-white">Sushi Diamantino</h1>
          <p className="mt-1 text-[13px] text-zinc-500">Controle de Estoque · acesso restrito</p>
        </div>

        <form onSubmit={submit} className="animate-fade-in mt-8 rounded-2xl border border-white/[0.08] bg-[#141417] p-6">
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-zinc-400">Usuário</span>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                disabled={busy}
                placeholder="seu.usuario"
                className="w-full rounded-lg border border-white/[0.08] bg-[#0e0e10] py-2.5 pl-10 pr-3.5 text-[14px] text-white placeholder:text-zinc-600 outline-none focus:border-white/25 disabled:opacity-60"
              />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-zinc-400">Senha</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={show ? "text" : "password"}
                autoComplete="current-password"
                disabled={busy}
                placeholder="••••••"
                className="w-full rounded-lg border border-white/[0.08] bg-[#0e0e10] py-2.5 pl-10 pr-11 text-[14px] text-white placeholder:text-zinc-600 outline-none focus:border-white/25 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-zinc-500 hover:text-white"
                aria-label={show ? "Ocultar senha" : "Mostrar senha"}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>

          {error ? (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] p-3 text-[12.5px] text-red-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-100 py-3 text-[14px] font-semibold text-zinc-950 transition hover:bg-white disabled:opacity-70"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Entrar
          </button>

          <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.015] p-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-zinc-500" />
            <p className="text-[11.5px] leading-relaxed text-zinc-500">
              Acesso por usuário e senha com perfil de permissões. Só o Administrador cria contas.
              {firstAccess ? " Primeiro acesso detectado — você será solicitado a trocar a senha." : ""}
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
