"use server";

import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordState =
  | { error: string }
  | { success: true; email: string }
  | undefined;

export async function forgotPasswordAction(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return { error: "Email is required." };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const supabase = await createClient();

  // Supabase deliberately returns success even if the email doesn't exist,
  // to avoid leaking whether an account is registered. We mirror that here.
  // Land directly on /auth/reset-password (no Supabase verify hop, no
  // /auth/callback hop). The email template appends ?token_hash=&type=recovery
  // to this URL, and verifyOtp() runs only on form submit — which means link
  // pre-scanners (Gmail, etc.) can't burn the single-use token before the user
  // clicks. See DECISIONS.md (2026-05-23).
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/reset-password`,
  });

  return { success: true, email };
}
