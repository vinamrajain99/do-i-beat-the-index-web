"use server";

import { createClient } from "@/lib/supabase/server";

export type SignupState =
  | { error: string }
  | { success: true; email: string }
  | undefined;

export async function signupAction(
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const supabase = await createClient();
  // Land directly on /auth/confirm — paired with the "Confirm signup" Supabase
  // email template which appends ?token_hash=&type=email. verifyOtp() runs only
  // when the user presses the button, so link pre-scanners can't burn the
  // single-use token. See DECISIONS.md (2026-05-23 signup follow-up).
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true, email };
}
