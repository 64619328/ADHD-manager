import { NextResponse } from "next/server";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function apiErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "请求失败";
  const status = error instanceof ApiError ? error.status : 500;
  return NextResponse.json({ error: message }, { status });
}
