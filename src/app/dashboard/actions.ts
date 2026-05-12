"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DeleteAnalysisResult = { error: string } | undefined;

/**
 * Deletes one analysis owned by the caller. Removes the row from
 * `public.analyses` first (RLS auto-scopes to the owner), then best-effort
 * removes the CSV from storage. Redirects to `/dashboard` on success — works
 * cleanly from both the list view (no-op redirect, list re-renders) and the
 * detail view (navigates back).
 *
 * If the storage cleanup fails, we log it server-side and still return
 * success: the row is gone, so the user's slot is freed. The orphaned CSV is
 * invisible to them and can be mopped up later.
 */
export async function deleteAnalysisAction(
  analysisId: string,
): Promise<DeleteAnalysisResult> {
  if (typeof analysisId !== "string" || !UUID_RE.test(analysisId)) {
    return { error: "Invalid analysis id." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // RLS scopes this to rows owned by the caller. A row owned by someone else
  // (or one that doesn't exist) returns null and we surface "not found".
  const { data: row, error: fetchErr } = await supabase
    .from("analyses")
    .select("id, csv_storage_path")
    .eq("id", analysisId)
    .maybeSingle();

  if (fetchErr) {
    return { error: `Could not look up analysis: ${fetchErr.message}` };
  }
  if (!row) {
    return { error: "Analysis not found." };
  }

  const { error: delErr } = await supabase
    .from("analyses")
    .delete()
    .eq("id", analysisId);
  if (delErr) {
    return { error: `Could not delete analysis: ${delErr.message}` };
  }

  const { error: storageErr } = await supabase.storage
    .from("csvs")
    .remove([row.csv_storage_path]);
  if (storageErr) {
    console.warn(
      `[delete] Row ${analysisId} deleted but CSV cleanup failed at csvs/${row.csv_storage_path}:`,
      storageErr.message,
    );
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
