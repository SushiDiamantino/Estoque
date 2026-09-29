import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { audit, currentUser, ROLE_LABEL, type Role } from "@/lib/auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "Somente o Administrador pode editar usuários." }, { status: 403 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  const [target] = await db.select().from(users).where(eq(users.id, id));
  if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 80);
  if (typeof body.role === "string") {
    if (!["admin", "gerente", "operador"].includes(body.role)) {
      return NextResponse.json({ error: "Perfil inválido." }, { status: 400 });
    }
    patch.role = body.role as Role;
  }
  if (typeof body.workArea === "string") patch.workArea = body.workArea.trim().slice(0, 80) || null;
  if (typeof body.shift === "string") patch.shift = body.shift.trim().slice(0, 40) || null;
  if (typeof body.phone === "string") patch.phone = body.phone.trim().slice(0, 40) || null;
  if (typeof body.email === "string") patch.email = body.email.trim().slice(0, 120) || null;
  if (typeof body.notes === "string") patch.notes = body.notes.trim().slice(0, 500) || null;
  if (body.active !== undefined) {
    const next = Boolean(body.active);
    if (!next && target.id === me.id) {
      return NextResponse.json({ error: "Você não pode inativar o próprio usuário." }, { status: 400 });
    }
    patch.active = next;
  }

  // último administrador ativo não pode ser rebaixado ou inativado
  const wasAdmin = target.role === "admin";
  const stillAdmin = patch.role ? patch.role === "admin" : wasAdmin;
  if (wasAdmin && (!stillAdmin || patch.active === false)) {
    const others = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
    const activeAdmins = others.filter((a) => a.id !== target.id);
    if (activeAdmins.length === 0) {
      return NextResponse.json(
        { error: "O sistema precisa de ao menos um Administrador ativo." },
        { status: 400 }
      );
    }
  }

  const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
  if (patch.active === false || patch.role !== undefined) {
    await db.delete(sessions).where(eq(sessions.userId, id));
  }
  await audit(
    me,
    "usuario.editado",
    target.username,
    [patch.role ? `perfil: ${ROLE_LABEL[patch.role as Role]}` : "", patch.active === false ? "inativado" : "", patch.active === true ? "reativado" : ""]
      .filter(Boolean)
      .join(" · ") || "dados atualizados"
  );
  return NextResponse.json({ user: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "Somente o Administrador pode excluir usuários." }, { status: 403 });
  }
  const { id } = await params;
  if (id === me.id) {
    return NextResponse.json({ error: "Você não pode excluir o próprio usuário." }, { status: 400 });
  }
  const [target] = await db.select().from(users).where(eq(users.id, id));
  if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  if (target.role === "admin") {
    const others = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
    if (others.filter((a) => a.id !== id).length === 0) {
      return NextResponse.json({ error: "O sistema precisa de ao menos um Administrador." }, { status: 400 });
    }
  }
  await db.delete(users).where(eq(users.id, id));
  await audit(me, "usuario.excluido", target.username, `${target.name} removido`);
  return NextResponse.json({ ok: true });
}
