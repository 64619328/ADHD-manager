import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const redirectTo = requestUrl.searchParams.get("next") || "/";

  if (tokenHash && type) {
    const supabase = await createClient();
    await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash
    });
  }

  return NextResponse.redirect(new URL(redirectTo, requestUrl.origin));
}
