import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { isValidEmail, normalizeEmail, requestMagicLink } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const email = normalizeEmail(body?.email);

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "请输入有效邮箱" }, { status: 400 });
    }

    const redirectTo = `${new URL(request.url).origin}/auth/callback`;

    await requestMagicLink(email, redirectTo);
    return NextResponse.json({ sent: true, email, redirectTo });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
