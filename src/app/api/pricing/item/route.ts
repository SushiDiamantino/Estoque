import { NextResponse } from "next/server";
import { itemPriceHistory, itemPriceStats, priceIncreaseAlerts, supplierKey } from "@/lib/pricing";
import { isUuid } from "@/lib/stock";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const itemId = sp.get("itemId") ?? "";
  if (!isUuid(itemId)) return NextResponse.json({ error: "Informe o item" }, { status: 400 });
  const [history, stats] = await Promise.all([itemPriceHistory(itemId), itemPriceStats(itemId)]);
  return NextResponse.json({ history, stats, key: stats ? supplierKey(stats.last?.supplier) : null });
}

/** ?alerts=1 → itens que ficaram mais caros no último recebimento. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const threshold = Math.min(1, Math.max(0.02, Number(body.threshold ?? 0.1)));
  const alerts = await priceIncreaseAlerts(threshold);
  return NextResponse.json({ alerts });
}
