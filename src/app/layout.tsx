import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sushi Diamantino · Controle de Estoque",
  description:
    "Sistema de controle de estoque do Sushi Diamantino — itens, categorias, locais, entradas, saídas, transferências, inventário e alertas.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="bg-[#0b0b0d] text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
