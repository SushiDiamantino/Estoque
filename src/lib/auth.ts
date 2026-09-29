import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db } from "@/db";
import { auditLogs, sessions, users } from "@/db/schema";
import { and, eq, gt, lt } from "drizzle-orm";

export type { Role, Permission } from "./roles";
export { ROLE_LABEL, ROLE_DESC, PERMISSIONS, can, ROUTE_PERMISSION } from "./roles";
import type { Role, Permission } from "./roles";
import { can as canPerm } from "./roles";

export type SessionUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
  mustChangePassword: boolean;
  workArea: string | null;
  shift: string | null;
};

const COOKIE = "sd_session";
const SESSION_DAYS = 7;

/* ------------------------------------------------------------------ senha */

const MIN_PW = 6;

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(pw, hash);
  } catch {
    return false;
  }
}

export function passwordProblem(pw: string): string | null {
  if (typeof pw !== "string" || pw.length < MIN_PW) return `A senha precisa de ao menos ${MIN_PW} caracteres.`;
  if (pw.length > 72) return "A senha é longa demais (máximo de 72 caracteres).";
  return null;
}

/* ------------------------------------------------------------------ sessão */

function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export async function createSession(userId: string): Promise<string> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ userId, token, expiresAt });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400_000,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
  (await cookies()).delete(COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      role: users.role,
      active: users.active,
      mustChangePassword: users.mustChangePassword,
      workArea: users.workArea,
      shift: users.shift,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.token, token));

  if (!row || !row.active || row.expiresAt <= new Date()) {
    if (row) await db.delete(sessions).where(eq(sessions.token, token));
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    mustChangePassword: row.mustChangePassword,
    workArea: row.workArea,
    shift: row.shift,
  };
}

/** Usuário logado ou redireciona para o login. */
export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requirePermission(perm: Permission): Promise<SessionUser> {
  const u = await requireUser();
  if (!canPerm(u.role, perm)) redirect("/sem-permissao");
  return u;
}

/** Atualiza o último acesso (throttle: só se passaram 5 min). */
export async function touchAccess(user: SessionUser): Promise<void> {
  const [row] = await db
    .select({ last: users.lastAccessAt })
    .from(users)
    .where(eq(users.id, user.id));
  if (!row?.last || Date.now() - new Date(row.last).getTime() > 5 * 60_000) {
    await db.update(users).set({ lastAccessAt: new Date() }).where(eq(users.id, user.id));
  }
}

/* ------------------------------------------------------------------ auditoria */

export async function audit(
  user: SessionUser | null,
  action: string,
  target?: string | null,
  details?: string | null
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: user?.id ?? null,
      userName: user?.name ?? "sistema",
      action,
      target: target?.slice(0, 200) ?? null,
      details: details?.slice(0, 1000) ?? null,
    });
  } catch (e) {
    console.error("audit", e);
  }
}

/* ------------------------------------------------------------------ bootstrap */

export async function userCount(): Promise<number> {
  const rows = await db.select({ id: users.id }).from(users);
  return rows.length;
}

/** Cria o admin/admin na primeira execução. */
export async function ensureSeedAdmin(): Promise<{ username: string; password: string } | null> {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return null;
  const passwordHash = await hashPassword("admin");
  await db.insert(users).values({
    name: "Administrador",
    username: "admin",
    passwordHash,
    role: "admin",
    active: true,
    mustChangePassword: true,
    workArea: "Gestão do sistema",
    shift: "Integral",
  });
  return { username: "admin", password: "admin" };
}

export async function cleanExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export async function sessionsOf(userId: string) {
  return db.select().from(sessions).where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())));
}

export { MIN_PW, COOKIE as SESSION_COOKIE };
