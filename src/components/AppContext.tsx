"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";

type Org = { name: string; shift: string };
type AppCtx = {
  org: Org;
  alertCount: number;
  refreshAlerts: () => Promise<void>;
  refreshOrg: () => Promise<void>;
};

const DEFAULT_ORG: Org = { name: "Sushi Diamantino", shift: "Turno tarde" };

const Ctx = createContext<AppCtx>({
  org: DEFAULT_ORG,
  alertCount: 0,
  refreshAlerts: async () => {},
  refreshOrg: async () => {},
});

export const useApp = () => useContext(Ctx);

/** Estado compartilhado entre topo, menu lateral e páginas. */
export function AppProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [org, setOrg] = useState<Org>(DEFAULT_ORG);
  const [alertCount, setAlertCount] = useState(0);

  const refreshAlerts = useCallback(async () => {
    const r = await api<{ attention: number }>("/api/alerts");
    if (r.ok) setAlertCount(Number(r.data.attention ?? 0));
  }, []);

  const refreshOrg = useCallback(async () => {
    const r = await api<{ settings: { restaurantName: string; shift: string } }>("/api/settings");
    if (r.ok && r.data.settings) {
      setOrg({ name: r.data.settings.restaurantName, shift: r.data.settings.shift });
    }
  }, []);

  useEffect(() => {
    refreshOrg();
  }, [refreshOrg]);

  // o sino é atualizado a cada navegação e após ações das páginas
  useEffect(() => {
    refreshAlerts();
  }, [refreshAlerts, pathname]);

  return (
    <Ctx.Provider value={{ org, alertCount, refreshAlerts, refreshOrg }}>
      {children}
    </Ctx.Provider>
  );
}
