import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  audit,
  cleanExpiredSessions,
  createSession,
  ensureSeedAdmin,
  passwordProblem,
  verifyPassword,
  type SessionUser,
} from "@/lib/auth";

const MINUTE = 60_000;
const BLOCK_MS = 5 * MINUTE;
const BLOCK_KEY = "__login_block__";

/** Trava simples contra tentativa de senha em série (em memória do processo). */
const fails = new Map<string, { n: number; first: number }>();

function blocked(user: string | null) {
  const rec = fails.get(user ?? BLOCK_KEY);
  if (!rec) return false;
  if (Date.now() - rec.first > BLOCK_MS) {
    fails.delete(user ?? BLOCK_KEY);
    return false;
  }
  return rec.n >= 5;
}
function addFail(user: string | null) {
  const k = user ?? BLOCK_KEY;
  const rec = fails.get(k);
  if (!rec) fails.set(k, { n: 1, first: Date.now() });
  else if (Date.now() - rec.first > BLOCK_MS) fails.set(k, { n: 1, first: Date.now() });
  else rec.n++;
}
function clearFails(user: string) {
  fails.delete(user);
}

export async function POST(req: Request) {
  await cleanExpiredSessions();
  const seeded = await ensureSeedAdmin();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const username = String(body?.username ?? "").trim().toLowerCase().slice(0, 40);
  const password = String(body?.password ?? "");

  if (!username || !password) {
    return NextResponse.json({ error: "Informe usuário e senha." }, { status: 400 });
  }
  if (blocked(username)) {
    return NextResponse.json(
      { error: "Muitas tentativas incorretas. Aguarde 5 minutos antes de tentar de novo." },
      { status: 429 }
    );
  }

  const [row] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = ${username}`);

  if (!row || !row.active) {
    addFail(username);
    // não revela se o usuário existe
    return NextResponse.json({ error: "Usuário ou senha incorretos." }, { status: 401 });
  }
  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) {
    addFail(username);
    return NextResponse.json({ error: "Usuário ou senha incorretos." }, { status: 401 });
  }
  clearFails(username);

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.id));
  await createSession(row.id);

  const user: SessionUser = {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    mustChangePassword: row.mustChangePassword,
    workArea: row.workArea,
    shift: row.shift,
  };
  await audit(user, "login", row.username);

  return NextResponse.json({
    ok: true,
    mustChangePassword: row.mustChangePassword,
    user,
    firstAccess: Boolean(seeded) && row.username === "admin",
  });
}
