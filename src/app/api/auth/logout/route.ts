import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { signOut } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await signOut();
    const response = NextResponse.json({ ok: true });
    response.cookies.set("task_user_session", "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
