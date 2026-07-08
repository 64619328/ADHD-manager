import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { isValidEmail, normalizeEmail, setSessionCookie, verifyEmailOtp } from "@/lib/auth";
import { normalizeText, syncAuthUser } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { email?: unknown; token?: unknown } | null;
    const email = normalizeEmail(body?.email);
    const token = normalizeText(body?.token);

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "请输入有效邮箱" }, { status: 400 });
    }

    if (!token) {
      return NextResponse.json({ error: "请输入验证码" }, { status: 400 });
    }

    const authUser = await verifyEmailOtp(email, token);
    const appUser = await syncAuthUser(authUser.authUserId, authUser.email);
    const user = {
      id: appUser.id,
      authUserId: authUser.authUserId,
      email: appUser.email
    };

    const response = NextResponse.json({ user });
    setSessionCookie(response, user);
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
