import { NextResponse } from "next/server";

export function apiErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "请求失败";
  return NextResponse.json({ error: message }, { status: 500 });
}
