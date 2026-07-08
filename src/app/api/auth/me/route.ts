import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ user: await getCurrentUser() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
