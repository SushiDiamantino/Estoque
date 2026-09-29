import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories, items } from "@/db/schema";
import { eq, sql, ilike, or, and, type SQL } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const status = searchParams.get("status") ?? "all";
  const sort = searchParams.get("sort") ?? "name-asc";

  let query = db
    .select({
      id: categories.id,
      name: categories.name,
      description: categories.description,
      icon: categories.icon,
      color: categories.color,
      active: categories.active,
      createdAt: categories.createdAt,
      updatedAt: categories.updatedAt,
      itemCount: sql<number>`(select count(*)::int from items where items.category_id = ${categories.id})`,
    })
    .from(categories)
    .$dynamic();

  const conds: SQL[] = [];
  if (q) {
    const c = or(ilike(categories.name, `%${q}%`), ilike(categories.description, `%${q}%`));
    if (c) conds.push(c);
  }
  if (status === "active") conds.push(eq(categories.active, true));
  if (status === "inactive") conds.push(eq(categories.active, false));
  if (conds.length) query = query.where(and(...conds));

  const rows = await query;

  rows.sort((a, b) => {
    if (sort === "name-desc") return b.name.localeCompare(a.name, "pt-BR");
    if (sort === "recent") return +new Date(b.createdAt) - +new Date(a.createdAt);
    if (sort === "items") return (b.itemCount ?? 0) - (a.itemCount ?? 0);
    return a.name.localeCompare(b.name, "pt-BR");
  });

  const total = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(categories);
  const activeCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(categories)
    .where(eq(categories.active, true));

  const withItems = await db
    .select({ count: sql<number>`count(distinct category_id)::int` })
    .from(items);

  return NextResponse.json({
    categories: rows,
    stats: {
      total: total[0]?.count ?? 0,
      active: activeCount[0]?.count ?? 0,
      inactive: (total[0]?.count ?? 0) - (activeCount[0]?.count ?? 0),
      empty: (total[0]?.count ?? 0) - (withItems[0]?.count ?? 0),
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description, icon, color, active } = body;
    if (!name?.trim()) {
      return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    }
    const [row] = await db
      .insert(categories)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
        icon: icon || "tag",
        color: color || "#a1a1aa",
        active: active ?? true,
      })
      .returning();
    return NextResponse.json({ category: row }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao criar categoria" }, { status: 500 });
  }
}
