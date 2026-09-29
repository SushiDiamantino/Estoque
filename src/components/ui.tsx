"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Loader2 } from "lucide-react";

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.07] bg-[#141417]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  accent?: ReactNode;
}) {
  return (
    <div className="card-hover rounded-xl border border-white/[0.07] bg-[#141417] p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-zinc-400">{label}</p>
        {icon ? (
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-zinc-400">
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <p className="text-[32px] font-semibold leading-none tracking-tight text-white">
          {value}
        </p>
        {accent}
      </div>
      {hint ? <p className="mt-2 text-[12.5px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function PageBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
      {children}
    </span>
  );
}

export function PrimaryButton({
  children,
  onClick,
  className,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2.5 text-[13.5px] font-semibold text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[13px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white",
        className
      )}
    >
      {children}
    </button>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: "green" | "yellow" | "red" | "gray" | "blue";
  children: ReactNode;
}) {
  const styles: Record<string, string> = {
    green:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    yellow: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    red: "border-red-500/20 bg-red-500/10 text-red-300",
    gray: "border-white/10 bg-white/[0.05] text-zinc-400",
    blue: "border-sky-500/20 bg-sky-500/10 text-sky-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] font-medium",
        styles[tone]
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="grid size-[68px] place-items-center rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#232329] to-[#1a1a1f] text-zinc-300 shadow-[0_12px_32px_rgba(0,0,0,0.4)]">
        {icon}
      </div>
      <h3 className="mt-5 text-[16px] font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-zinc-500">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function TableShell({
  head,
  children,
  empty,
}: {
  head: ReactNode;
  children: ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr className="border-y border-white/[0.06] bg-white/[0.015] text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500">
            {head}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {empty ? (
            <tr>
              <td colSpan={20} className="p-0">
                {children}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Th({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th className={cn("px-5 py-3 font-semibold", className)}>{children}</th>
  );
}

export function Td({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={cn("px-5 py-4 align-middle", className)}>{children}</td>;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <svg
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/[0.08] bg-[#0e0e10] py-2.5 pl-10 pr-4 text-[13.5px] text-zinc-200 placeholder:text-zinc-600 outline-none transition focus:border-white/20"
      />
    </div>
  );
}

export function Select({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-white/[0.08] bg-[#1a1a1f] py-2.5 pl-3.5 pr-9 text-[13px] font-medium text-zinc-300 outline-none transition hover:border-white/15 focus:border-white/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-zinc-900">
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { value: string; label: string; count?: number }[];
  active: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-5 overflow-x-auto border-b border-white/[0.06] px-5">
      {tabs.map((t) => {
        const isActive = t.value === active;
        return (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative whitespace-nowrap py-3.5 text-[13px] font-medium transition",
              isActive ? "text-white" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            {t.label}
            {typeof t.count === "number" ? (
              <span
                className={cn(
                  "ml-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                  isActive
                    ? "bg-white/10 text-zinc-200"
                    : "bg-white/[0.05] text-zinc-500"
                )}
              >
                {t.count}
              </span>
            ) : null}
            {isActive ? (
              <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-white" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function LoadingRows({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 px-6 py-14 text-[13.5px] text-zinc-500">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          "animate-slide-in relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-[#141417] shadow-2xl sm:rounded-2xl",
          wide ? "max-w-3xl" : "max-w-lg"
        )}
      >
        <div className="sticky top-0 z-10 border-b border-white/[0.07] bg-[#141417]/95 px-6 py-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[16px] font-semibold text-white">{title}</h2>
              {subtitle ? (
                <p className="mt-1 text-[13px] text-zinc-500">{subtitle}</p>
              ) : null}
            </div>
            <button
              onClick={onClose}
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-400 transition hover:text-white"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-zinc-400">
        {label} {required ? <span className="text-red-400">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] text-zinc-600">{hint}</span> : null}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-white/[0.08] bg-[#0e0e10] px-3.5 py-2.5 text-[13.5px] text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-white/25";

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5"
    >
      <span
        className={cn(
          "relative h-5 w-9 rounded-full transition",
          checked ? "bg-emerald-500" : "bg-zinc-700"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white transition-all",
            checked ? "left-[18px]" : "left-0.5"
          )}
        />
      </span>
      {label ? (
        <span className="text-[13px] text-zinc-300">{label}</span>
      ) : null}
    </button>
  );
}
