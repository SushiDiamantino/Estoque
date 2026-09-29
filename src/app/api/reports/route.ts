import { NextResponse } from "next/server";
import { buildReport } from "@/lib/reports/build";
import { addDays, DAY_RE, diffDays, todayLocal } from "@/lib/reports/dates";
import { isUuid } from "@/lib/stock";
import type { Granularity } from "@/lib/reports/types";

const clampInt = (v: string | null, def: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && v !== null && v !== "" ? Math.min(max, Math.max(min, n)) : def;
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const today = todayLocal();
  let from = sp.get("from") ?? "";
  let to = sp.get("to") ?? "";
  const valid = (d: string) => DAY_RE.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d;
  if (!valid(to) || to > today) to = today;
  if (!valid(from)) from = addDays(to, -29);
  if (from > today) from = today;
  if (from > to) [from, to] = [to, from];
  if (diffDays(from, to) > 730) from = addDays(to, -730);

  const location = sp.get("location");
  const category = sp.get("category");
  const g = sp.get("granularity") ?? "auto";

  try {
    const data = await buildReport({
      from,
      to,
      locationId: isUuid(location) ? location : null,
      categoryId: isUuid(category) ? category : null,
      granularity: (["auto", "day", "week", "month"].includes(g) ? g : "auto") as Granularity,
      targetDays: clampInt(sp.get("target"), 15, 1, 120),
      horizon: clampInt(sp.get("horizon"), 30, 7, 180),
    });
    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Não foi possível consolidar o relatório." }, { status: 500 });
  }
}
