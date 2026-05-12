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
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/auth/reset-password`,
  });

  return { success: true, email };
}
