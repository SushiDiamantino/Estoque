import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs, sessions, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { audit, currentUser, hashPassword, passwordProblem, ROLE_LABEL, type Role } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/stock";

const USERNAME_RE = /^[a-z0-9._-]{3,40}$/;

export async function GET() {
  const me = await currentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "Somente o Administrador gerencia usuários." }, { status: 403 });
  }
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      role: users.role,
      active: users.active,
      mustChangePassword: users.mustChangePassword,
      workArea: users.workArea,
      shift: users.shift,
      phone: users.phone,
      email: users.email,
      notes: users.notes,
      lastLoginAt: users.lastLoginAt,
      lastAccessAt: users.lastAccessAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  const withSessions = await Promise.all(
    rows.map(async (u) => {
      const s = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, u.id));
      return { ...u, activeSessions: s.length, roleLabel: ROLE_LABEL[u.role as Role] ?? u.role };
    })
  );
  return NextResponse.json({ users: withSessions });
}

/** Cria usuário (somente admin). */
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "Somente o Administrador pode criar usuários." }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  const name = String(body.name ?? "").trim().slice(0, 80);
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const role = String(body.role ?? "operador") as Role;

  if (!name) return NextResponse.json({ error: "Informe o nome do usuário." }, { status: 400 });
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "Usuário deve ter 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado." },
      { status: 400 }
    );
  }
  if (!["admin", "gerente", "operador"].includes(role)) {
    return NextResponse.json({ error: "Perfil inválido." }, { status: 400 });
  }
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const passwordHash = await hashPassword(password);
  try {
    const [row] = await db
      .insert(users)
      .values({
        name,
        username,
        passwordHash,
        role,
        active: body.active === undefined ? true : Boolean(body.active),
        mustChangePassword: body.mustChangePassword === false ? false : true,
        workArea: typeof body.workArea === "string" && body.workArea.trim() ? body.workArea.trim().slice(0, 80) : null,
        shift: typeof body.shift === "string" && body.shift.trim() ? body.shift.trim().slice(0, 40) : null,
        phone: typeof body.phone === "string" && body.phone.trim() ? body.phone.trim().slice(0, 40) : null,
        email: typeof body.email === "string" && body.email.trim() ? body.email.trim().slice(0, 120) : null,
        notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 500) : null,
      })
      .returning();
    await audit(me, "usuario.criado", row.username, `${row.name} · perfil ${ROLE_LABEL[row.role as Role]}`);
    return NextResponse.json({ user: row }, { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "Este nome de usuário já está em uso." }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Erro ao criar usuário." }, { status: 500 });
  }
}
