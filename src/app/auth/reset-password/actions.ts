"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type ResetPasswordState = { error?: string } | undefined;

const ALLOWED_OTP_TYPES: ReadonlySet<EmailOtpType> = new Set<EmailOtpType>([
  "recovery",
  "email",
  "email_change",
  "invite",
  "magiclink",
  "signup",
]);

export async function resetPasswordAction(
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const tokenHash = String(formData.get("token_hash") ?? "");
  const rawType = String(formData.get("type") ?? "recovery");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }
  if (!tokenHash) {
    return {
      error:
        "Reset link is missing its token. Request a new password reset email.",
    };
  }
  if (!ALLOWED_OTP_TYPES.has(rawType as EmailOtpType)) {
    return { error: "Reset link type is invalid." };
  }
  const type = rawType as EmailOtpType;

  const supabase = await createClient();

  // verifyOtp consumes the single-use token *now*, only because the user
  // pressed the button — pre-scanners can't reach this code path. On success
  // it sets the session cookie so updateUser() below has an authenticated user.
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });
  if (verifyError) {
    return {
      error:
        "Reset link is invalid or has expired. Request a new password reset email.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
