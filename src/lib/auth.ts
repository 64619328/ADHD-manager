import { ApiError } from "./api-errors";
import { syncAuthUser } from "./db";
import { createClient } from "./supabase/server";

export type AuthUser = {
  id: string;
  authUserId: string;
  email: string;
};

type AuthErrorLike = {
  message?: string;
  status?: number;
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

function toApiError(error: AuthErrorLike, fallback = "Supabase Auth 请求失败") {
  const message = error.message || fallback;

  if (error.status === 429 || message.toLowerCase().includes("rate limit")) {
    return new ApiError("发送太频繁了，请等待 60 秒后再试。", 429);
  }

  return new ApiError(message, error.status || 500);
}

export async function requestMagicLink(email: string, emailRedirectTo: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo
    }
  });

  if (error) {
    throw toApiError(error, "发送登录链接失败");
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return null;
  }

  const email = typeof data.claims.email === "string" ? normalizeEmail(data.claims.email) : "";
  if (!email) {
    return null;
  }

  const appUser = await syncAuthUser(data.claims.sub, email);
  return {
    id: appUser.id,
    authUserId: data.claims.sub,
    email: appUser.email
  };
}

export async function requireCurrentUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new ApiError("请先用邮箱登录", 401);
  }
  return user;
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw toApiError(error, "退出登录失败");
  }
}
