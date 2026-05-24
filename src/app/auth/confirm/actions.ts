"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type ConfirmState = { error?: string } | undefined;

const ALLOWED_OTP_TYPES: ReadonlySet<EmailOtpType> = new Set<EmailOtpType>([
  "email",
  "signup",
  "invite",
  "magiclink",
  "email_change",
  "recovery",
]);

export async function confirmEmailAction(
  _prevState: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const rawType = String(formData.get("type") ?? "email");

  if (!tokenHash) {
    return {
      error: "Missing confirmation token. Sign up again to receive a new link.",
    };
  }
  if (!ALLOWED_OTP_TYPES.has(rawType as EmailOtpType)) {
    return { error: "Confirmation link type is invalid." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: rawType as EmailOtpType,
    token_hash: tokenHash,
  });
  if (error) {
    return {
      error:
        "Confirmation link is invalid or has expired. Sign up again to receive a new link.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
