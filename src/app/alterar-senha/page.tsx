"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2, ShieldAlert, Check, Eye, EyeOff, LogOut } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";

export default function AlterarSenhaPage() {
  const router = useRouter();
  const { push } = useToast();
  const [user, setUser] = useState<{ name: string; username: string; mustChangePassword: boolean } | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ user: { name: string; username: string; mustChangePassword: boolean } }>("/api/auth/me").then((r) => {
      if (r.ok && r.data.user) setUser(r.data.user);
      else router.replace("/login");
    });
  }, [router]);

  const strength = usePasswordStrength(next);
  const canSubmit = current.length > 0 && next.length >= 6 && next === confirm && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const r = await api("/api/auth/password", { method: "POST", json: { currentPassword: current, newPassword: next, confirmPassword: confirm, signOutOthers: true } });
    setBusy(false);
    if (r.ok) {
      push({ kind: "success", title: "Senha alterada", msg: "Sessões anteriores foram encerradas." });
      router.replace("/");
      router.refresh();
    } else {
      setError(r.error ?? "Não foi possível alterar a senha.");
    }
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#0b0b0d] px-5 py-10">
      <div className="w-full max-w-[440px]">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-amber-400/15 text-amber-300">
            <ShieldAlert className="size-5" />
          </span>
          <div>
            <h1 className="text-[20px] font-bold tracking-tight text-white">Troca de senha obrigatória</h1>
            <p className="text-[12.5px] text-zinc-500">
              {user ? `${user.name} · ${user.username}` : "carregando…"}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="animate-fade-in mt-6 rounded-2xl border border-white/[0.08] bg-[#141417] p-6">
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 text-[12.5px] leading-relaxed text-amber-200">
            Por segurança, defina uma senha pessoal antes de continuar. A senha atual é a que você
            acabou de usar para entrar.
          </p>

          <label className="mt-5 block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-zinc-400">Senha atual</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
              <input
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                type={show ? "text" : "password"}
                autoComplete="current-password"
                autoFocus
                disabled={busy}
                className="w-full rounded-lg border border-white/[0.08] bg-[#0e0e10] py-2.5 pl-10 pr-11 text-[14px] text-white outline-none focus:border-white/25 disabled:opacity-60"
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

          <label className="mt-4 block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-zinc-400">Nova senha</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
              <input
                value={next}
                onChange={(e) => setNext(e.target.value)}
                type="password"
                autoComplete="new-password"
                disabled={busy}
                className="w-full rounded-lg border border-white/[0.08] bg-[#0e0e10] py-2.5 pl-10 pr-3.5 text-[14px] text-white outline-none focus:border-white/25 disabled:opacity-60"
              />
            </div>
            <PasswordMeter strength={strength} />
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-zinc-400">Confirmar nova senha</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                type="password"
                autoComplete="new-password"
                disabled={busy}
                className={cnInput(confirm, next)}
              />
            </div>
            {confirm && next && confirm !== next ? (
              <p className="mt-1 text-[11.5px] text-red-400">As senhas não coincidem.</p>
            ) : null}
          </label>

          {error ? (
            <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/[0.06] p-3 text-[12.5px] text-red-200">{error}</p>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={logout} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-4 py-2.5 text-[13px] font-medium text-zinc-400 hover:text-white">
              <LogOut className="size-4" /> Sair
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-100 px-4 py-2.5 text-[13.5px] font-semibold text-zinc-950 transition hover:bg-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Salvar e continuar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function cnInput(confirm: string, next: string) {
  return `w-full rounded-lg border bg-[#0e0e10] py-2.5 pl-10 pr-3.5 text-[14px] text-white outline-none focus:border-white/25 disabled:opacity-60 ${
    confirm && next && confirm !== next ? "border-red-500/40" : "border-white/[0.08]"
  }`;
}

function usePasswordStrength(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
}

const METER: Record<number, { label: string; color: string; bars: number }> = {
  0: { label: "—", color: "bg-zinc-700", bars: 0 },
  1: { label: "Fraca", color: "bg-red-500", bars: 1 },
  2: { label: "Razoável", color: "bg-amber-500", bars: 2 },
  3: { label: "Boa", color: "bg-sky-500", bars: 3 },
  4: { label: "Forte", color: "bg-emerald-500", bars: 4 },
};

function PasswordMeter({ strength }: { strength: number }) {
  const m = METER[strength];
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= m.bars ? m.color : "bg-white/[0.08]"}`} />
        ))}
      </div>
      <span className="w-16 text-right text-[11px] text-zinc-500">{m.label}</span>
    </div>
  );
}
