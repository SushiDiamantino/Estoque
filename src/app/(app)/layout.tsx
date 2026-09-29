"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { CommandPalette } from "@/components/CommandPalette";
import { ToastProvider } from "@/components/Toast";
import { AppProvider, useApp } from "@/components/AppContext";
import { AuthProvider } from "@/components/AuthContext";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AppProvider>
        <AuthProvider>
          <Shell>{children}</Shell>
        </AuthProvider>
      </AppProvider>
    </ToastProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { org, alertCount, refreshAlerts } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);

  return (
    <div className="min-h-screen bg-[#0b0b0d]">
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        orgName={org.name}
        shift={org.shift}
      />
      <div className="lg:pl-[264px]">
        <Topbar
          onMenu={() => setMobileOpen(true)}
          onSearch={openSearch}
          alertCount={alertCount}
          orgName={org.name}
          shift={org.shift}
          onAlertsChanged={refreshAlerts}
        />
        <main className="px-4 pb-16 pt-6 sm:px-6 lg:px-8">{children}</main>
      </div>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
