import { NextResponse } from "next/server";
import { getDemandOverview } from "@/lib/demand/engine";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const horizon = sp.get("horizon") ? Number(sp.get("horizon")) : undefined;
    const target = sp.get("target") ? Number(sp.get("target")) : undefined;
    const data = await getDemandOverview(
      horizon !== undefined && Number.isFinite(horizon) ? horizon : undefined,
      target !== undefined && Number.isFinite(target) ? target : undefined
    );
    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Não foi possível gerar a central de demanda." }, { status: 500 });
  }
}
