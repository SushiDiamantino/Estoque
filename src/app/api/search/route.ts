import { NextResponse } from "next/server";
import { db } from "@/db";
import { items, categories, storageLocations, movements, loans, partners } from "@/db/schema";
import { eq, ilike, or } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });
  const like = `%${q}%`;

  const [itemRows, catRows, locRows, movRows, loanRows] = await Promise.all([
    db
      .select({ id: items.id, name: items.name, sku: items.sku, unit: items.unit })
      .from(items)
      .where(or(ilike(items.name, like), ilike(items.sku, like)))
      .limit(5),
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(ilike(categories.name, like))
      .limit(3),
    db
      .select({ id: storageLocations.id, name: storageLocations.name })
      .from(storageLocations)
      .where(ilike(storageLocations.name, like))
      .limit(3),
    db
      .select({
        id: movements.id,
        code: movements.code,
        type: movements.type,
        supplier: movements.supplier,
      })
      .from(movements)
      .where(
        or(ilike(movements.code, like), ilike(movements.supplier, like))
      )
      .limit(4),
    db
      .select({ id: loans.id, code: loans.code, direction: loans.direction, status: loans.status, dueDate: loans.dueDate, partner: partners.name })
      .from(loans)
      .innerJoin(partners, eq(loans.partnerId, partners.id))
      .where(or(ilike(loans.code, like), ilike(partners.name, like)))
      .limit(4),
  ]);

  const results = [
    ...loanRows.map((r) => ({
      id: `loan-${r.id}`,
      kind: "empréstimo",
      title: `${r.code} · ${r.partner}`,
      subtitle: `${r.direction === "pegamos" ? "Pegamos emprestado" : "Emprestamos"} · ${r.status} · prazo ${r.dueDate.split("-").reverse().join("/")}`,
      href: `/emprestimos?q=${encodeURIComponent(r.code)}`,
    })),
    ...itemRows.map((r) => ({
      id: `item-${r.id}`,
      kind: "item",
      title: r.name,
      subtitle: `${r.sku} · ${r.unit}`,
      href: `/itens?q=${encodeURIComponent(r.name)}`,
    })),
    ...catRows.map((r) => ({
      id: `cat-${r.id}`,
      kind: "categoria",
      title: r.name,
      subtitle: "Categoria operacional",
      href: `/categorias?q=${encodeURIComponent(r.name)}`,
    })),
    ...locRows.map((r) => ({
      id: `loc-${r.id}`,
      kind: "local",
      title: r.name,
      subtitle: "Local de armazenamento",
      href: `/locais?q=${encodeURIComponent(r.name)}`,
    })),
    ...movRows.map((r) => ({
      id: `mov-${r.id}`,
      kind: "movimento",
      title: r.code,
      subtitle: `${r.type} · ${r.supplier ?? "—"}`,
      href:
        r.type === "entrada"
          ? `/entradas`
          : r.type === "saida"
            ? `/saidas`
            : `/transferencias`,
    })),
  ];

  return NextResponse.json({ results });
}
