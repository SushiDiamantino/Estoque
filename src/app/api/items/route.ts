import { NextResponse } from "next/server";
import { db } from "@/db";
import { items, categories } from "@/db/schema";
import { eq, sql, ilike, or, and, type SQL } from "drizzle-orm";
import { isUniqueViolation, isUuid } from "@/lib/stock";

function skuGen(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12);
  const rand = Math.floor(100 + Math.random() * 900);
  return `${base || "ITEM"}-${rand}`;
}

/** Gera um SKU que ainda não existe (tenta algumas vezes antes de usar sufixo temporal). */
async function uniqueSku(name: string) {
  for (let i = 0; i < 6; i++) {
    const candidate = skuGen(name);
    const [exists] = await db.select({ id: items.id }).from(items).where(eq(items.sku, candidate));
    if (!exists) return candidate;
  }
  return `${skuGen(name)}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
}

const str = (v: unknown, max = 200) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category") ?? "all";
  const unit = searchParams.get("unit") ?? "all";
  const status = searchParams.get("status") ?? "all";

  const conds: SQL[] = [];
  if (q) {
    const c = or(
      ilike(items.name, `%${q}%`),
      ilike(items.sku, `%${q}%`),
      ilike(items.barcode, `%${q}%`)
    );
    if (c) conds.push(c);
  }
  if (status === "active") conds.push(eq(items.active, true));
  if (status === "inactive") conds.push(eq(items.active, false));
  if (category !== "all" && isUuid(category)) conds.push(eq(items.categoryId, category));
  if (unit !== "all") conds.push(eq(items.unit, unit.slice(0, 12)));

  const [rows, statsRow] = await Promise.all([
    db
      .select({
        id: items.id,
        name: items.name,
        sku: items.sku,
        barcode: items.barcode,
        description: items.description,
        categoryId: items.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        unit: items.unit,
        minStock: items.minStock,
        maxStock: items.maxStock,
        lotControl: items.lotControl,
        expiryControl: items.expiryControl,
        perishable: items.perishable,
        active: items.active,
        costPrice: items.costPrice,
        supplier: items.supplier,
        createdAt: items.createdAt,
        totalQty: sql<string>`coalesce((select sum(stock_balances.quantity::numeric) from stock_balances where stock_balances.item_id = ${items.id}), 0)`,
      })
      .from(items)
      .leftJoin(categories, eq(items.categoryId, categories.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(items.name)
      .limit(1000),
    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${items.active})::int`,
        lot: sql<number>`count(*) filter (where ${items.lotControl})::int`,
        expiry: sql<number>`count(*) filter (where ${items.expiryControl})::int`,
      })
      .from(items),
  ]);

  const s = statsRow[0];
  return NextResponse.json({
    items: rows,
    stats: {
      total: s?.total ?? 0,
      active: s?.active ?? 0,
      inactive: (s?.total ?? 0) - (s?.active ?? 0),
      lot: s?.lot ?? 0,
      expiry: s?.expiry ?? 0,
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });

    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    if (name.length > 120) {
      return NextResponse.json({ error: "Nome muito longo (máx. 120 caracteres)" }, { status: 400 });
    }
    if (body.categoryId && !isUuid(body.categoryId)) {
      return NextResponse.json({ error: "Categoria inválida" }, { status: 400 });
    }
    const skuInput = typeof body.sku === "string" ? body.sku.trim().toUpperCase().slice(0, 40) : "";

    const [row] = await db
      .insert(items)
      .values({
        name,
        sku: skuInput || (await uniqueSku(name)),
        barcode: str(body.barcode, 64),
        description: str(body.description, 1000),
        categoryId: isUuid(body.categoryId) ? body.categoryId : null,
        unit: str(body.unit, 12) ?? "un",
        minStock: String(num(body.minStock)),
        maxStock: String(num(body.maxStock)),
        lotControl: Boolean(body.lotControl),
        expiryControl: Boolean(body.expiryControl),
        perishable: Boolean(body.perishable),
        active: body.active === undefined ? true : Boolean(body.active),
        costPrice: String(num(body.costPrice)),
        supplier: str(body.supplier, 120),
        leadTimeDays: Math.min(90, Math.round(num(body.leadTimeDays))),
      })
      .returning();
    return NextResponse.json({ item: row }, { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "SKU já cadastrado. Informe outro código." }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Erro ao criar item" }, { status: 500 });
  }
}
