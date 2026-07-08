import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError } from "./api-errors";

const SESSION_COOKIE = "task_user_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type AuthUser = {
  id: string;
  authUserId?: string;
  email: string;
};

type SupabaseAuthUser = {
  id: string;
  email?: string;
};

type SupabaseVerifyResponse = {
  access_token?: string;
  refresh_token?: string;
  user?: SupabaseAuthUser;
};

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getSessionSecret() {
  return process.env.SESSION_SECRET || "local-development-session-secret";
}

function getSupabaseAuthConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new ApiError("Supabase Auth 未配置：请设置 SUPABASE_URL 和 SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY", 500);
  }

  return {
    authUrl: `${url}/auth/v1`,
    key
  };
}

async function supabaseAuthRequest<T>(path: string, body: unknown): Promise<T> {
  const { authUrl, key } = getSupabaseAuthConfig();
  const response = await fetch(`${authUrl}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T) : ({} as T);

  if (!response.ok) {
    const errorPayload = payload as { msg?: string; error?: string; error_description?: string };
    const detail = errorPayload.error_description || errorPayload.msg || errorPayload.error || "Supabase Auth 请求失败";
    throw new ApiError(detail, response.status);
  }

  return payload;
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function verifySignature(value: string, signature: string) {
  const expected = sign(value);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createSessionToken(user: AuthUser) {
  const payload = toBase64Url(
    JSON.stringify({
      id: user.id,
      authUserId: user.authUserId,
      email: user.email,
      nonce: randomUUID()
    })
  );
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(value: string | undefined): AuthUser | null {
  if (!value) {
    return null;
  }

  const [payload, signature] = value.split(".");
  if (!payload || !signature || !verifySignature(payload, signature)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as Partial<AuthUser>;
    if (!parsed.id || !parsed.email) {
      return null;
    }
    return {
      id: parsed.id,
      authUserId: parsed.authUserId,
      email: parsed.email
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  return readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireCurrentUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new ApiError("请先用邮箱登录", 401);
  }
  return user;
}

export function setSessionCookie(response: NextResponse, user: AuthUser) {
  response.cookies.set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

export async function requestEmailOtp(email: string) {
  await supabaseAuthRequest("/otp", {
    email,
    create_user: true
  });
}

export async function verifyEmailOtp(email: string, token: string) {
  const payload = await supabaseAuthRequest<SupabaseVerifyResponse>("/verify", {
    email,
    token,
    type: "email"
  });

  if (!payload.user?.id || !payload.user.email) {
    throw new ApiError("验证码验证失败，请重新获取验证码", 401);
  }

  return {
    authUserId: payload.user.id,
    email: payload.user.email
  };
}
