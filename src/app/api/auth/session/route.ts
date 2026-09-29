import { NextResponse } from "next/server";
import { currentUser, can } from "@/lib/auth";
import type { Permission } from "@/lib/roles";

/**
 * Verificação completa de sessão para o cliente: quem é, se precisa trocar a
 * senha e se tem permissão para uma rota específica (?perm=itens).
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "no-session" }, { status: 401 });
  }
  const perm = new URL(req.url).searchParams.get("perm");
  if (perm && !can(user.role, perm as Permission)) {
    return NextResponse.json({ ok: false, reason: "forbidden", user }, { status: 403 });
  }
  return NextResponse.json({ ok: true, user, mustChangePassword: user.mustChangePassword });
}
