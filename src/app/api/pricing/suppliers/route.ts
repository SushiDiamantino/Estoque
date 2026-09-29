import { NextResponse } from "next/server";
import { supplierRanking } from "@/lib/pricing";

export async function GET(req: Request) {
  const days = [30, 90, 180, 365].includes(Number(new URL(req.url).searchParams.get("days")))
    ? Number(new URL(req.url).searchParams.get("days"))
    : 180;
  const { suppliers, perItem } = await supplierRanking(days);
  const total = suppliers.reduce((a, s) => a + s.totalValue, 0);
  return NextResponse.json({ days, suppliers, perItem, total });
}
