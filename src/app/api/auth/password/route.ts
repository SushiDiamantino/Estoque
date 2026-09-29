import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { and, eq, gt, ne } from "drizzle-orm";
import { audit, currentUser, destroySession, hashPassword, passwordProblem } from "@/lib/auth";

/** Troca a própria senha (obrigatório no primeiro acesso). */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const current = String(body?.currentPassword ?? "");
  const next = String(body?.newPassword ?? "");
  const confirm = String(body?.confirmPassword ?? "");

  if (!current) return NextResponse.json({ error: "Informe a senha atual." }, { status: 400 });
  const problem = passwordProblem(next);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (next !== confirm) return NextResponse.json({ error: "A confirmação não coincide com a nova senha." }, { status: 400 });
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  if (next === current) {
    return NextResponse.json({ error: "A nova senha precisa ser diferente da atual." }, { status: 400 });
  }

  const [row] = await db.select().from(users).where(eq(users.id, user.id));
  if (!row) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  const { verifyPassword } = await import("@/lib/auth");
  if (!(await verifyPassword(current, row.passwordHash))) {
    return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
  }

  const passwordHash = await hashPassword(next);
  await db
    .update(users)
    .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  // encerra as outras sessões do usuário (mantém a atual)
  await audit({ ...user, mustChangePassword: false }, "senha.alterada", user.username, "Senha alterada pelo próprio usuário");
  if (body.signOutOthers === true) {
    const { cookies } = await import("next/headers");
    const token = (await cookies()).get("sd_session")?.value;
    if (token) {
      await db.delete(sessions).where(and(ne(sessions.token, token), eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date())));
    }
  }
  return NextResponse.json({ ok: true });
}

/** Admin redefine a senha de qualquer usuário (volta a exigir troca). */
export async function PATCH(req: Request) {
  const me = await currentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "Somente o Administrador pode redefinir senhas." }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = String(body?.userId ?? "");
  const next = String(body?.newPassword ?? "");
  if (!id) return NextResponse.json({ error: "Informe o usuário." }, { status: 400 });
  const problem = passwordProblem(next);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const [target] = await db.select().from(users).where(eq(users.id, id));
  if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  const passwordHash = await hashPassword(next);
  await db
    .update(users)
    .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
    .where(eq(users.id, id));
  // encerra sessões ativas do usuário
  await db.delete(sessions).where(eq(sessions.userId, id));
  await audit(me, "senha.redefinida", target.username, `Senha redefinida por ${me.name}`);
  return NextResponse.json({ ok: true });
}
