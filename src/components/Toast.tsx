"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; title: string; msg?: string };

const Ctx = createContext<{ push: (t: Omit<Toast, "id">) => void }>({
  push: () => {},
});

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 4200);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex w-[340px] max-w-[calc(100vw-40px)] flex-col gap-2.5">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-slide-in pointer-events-auto flex items-start gap-3 rounded-xl border border-white/10 bg-[#1b1b20] p-4 shadow-2xl"
          >
            {t.kind === "success" ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-400" />
            ) : t.kind === "error" ? (
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-400" />
            ) : (
              <Info className="mt-0.5 size-5 shrink-0 text-sky-400" />
            )}
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-white">{t.title}</p>
              {t.msg ? (
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-zinc-400">
                  {t.msg}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
