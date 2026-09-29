import { NextResponse } from "next/server";
import { audit, currentUser, destroySession } from "@/lib/auth";

export async function POST() {
  const user = await currentUser();
  await audit(user, "logout", user?.username);
  await destroySession();
  return NextResponse.json({ ok: true });
}
