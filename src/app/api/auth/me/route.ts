import { NextResponse } from "next/server";
import { currentUser, touchAccess } from "@/lib/auth";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  await touchAccess(user);
  return NextResponse.json({ user });
}
