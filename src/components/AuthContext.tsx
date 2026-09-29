"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ROUTE_PERMISSION, type Role } from "@/lib/roles";
import { PERMISSIONS } from "@/lib/roles";

export type Me = {
  id: string;
  name: string;
  username: string;
  role: Role;
  mustChangePassword: boolean;
  workArea: string | null;
  shift: string | null;
};

type Ctx = {
  me: Me | null;
  loading: boolean;
  logout: () => Promise<void>;
  can: (perm: string) => boolean;
};

const AuthCtx = createContext<Ctx>({ me: null, loading: true, logout: async () => {}, can: () => false });

export const useMe = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api<{ user: Me | null }>("/api/auth/me").then((r) => {
      if (!alive) return;
      if (r.ok && r.data.user) setMe(r.data.user);
      else setMe(null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // rotas protegidas: sem sessão -> login; sem permissão -> sem-permissao
  useEffect(() => {
    if (loading || !pathname) return;
    if (pathname.startsWith("/login") || pathname.startsWith("/imprimir") || pathname.startsWith("/sem-permissao")) return;
    if (!me) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (me.mustChangePassword && pathname !== "/alterar-senha") {
      router.replace("/alterar-senha");
      return;
    }
    const base = ["/itens", "/categorias", "/locais", "/entradas", "/saidas", "/transferencias", "/emprestimos", "/compras", "/inventario", "/alertas", "/relatorios", "/demanda", "/configuracoes", "/usuarios"].find(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );
    if (!base) return;
    const perm = ROUTE_PERMISSION[base];
    const allowed = PERMISSIONS[me.role].includes("*") || PERMISSIONS[me.role].includes(perm);
    if (!allowed) router.replace("/sem-permissao");
  }, [loading, me, pathname, router]);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setMe(null);
    router.replace("/login");
    router.refresh();
  }, [router]);

  const can = useCallback(
    (perm: string) => {
      if (!me) return false;
      const list = PERMISSIONS[me.role];
      return list.includes("*") || list.includes(perm);
    },
    [me]
  );

  return <AuthCtx.Provider value={{ me, loading, logout, can }}>{children}</AuthCtx.Provider>;
}
