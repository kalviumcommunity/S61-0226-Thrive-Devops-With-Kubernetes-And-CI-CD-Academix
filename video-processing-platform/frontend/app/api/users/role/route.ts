import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const ALLOWED_ROLES = new Set(["student", "admin"]);

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { role?: string };
  const role = body.role;

  if (!role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const clerk = await clerkClient();
  await clerk.users.updateUserMetadata(userId, {
    publicMetadata: { role },
    unsafeMetadata: { role },
  });

  return NextResponse.json({ ok: true });
}
