"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_BENCHMARKS,
  MAX_CSV_BYTES,
  TICKER_REGEX,
} from "@/lib/types";

export type CreateAnalysisState = { error?: string } | undefined;

/**
 * Validates the form, inserts a `pending` analyses row, uploads the CSV to
 * `csvs/<user_uid>/<analysis_id>.csv`, and redirects to /dashboard/<id>.
 *
 * The 5-row cap is enforced by the `enforce_analysis_limit` Postgres trigger
 * — we catch its `analysis_limit_reached` exception and surface a friendly
 * error instead of a stack trace.
 *
 * If the storage upload fails after the insert succeeded, we delete the row
 * so the user's slot is freed and the trigger count stays consistent.
 */
export async function createAnalysisAction(
  _prevState: CreateAnalysisState,
  formData: FormData,
): Promise<CreateAnalysisState> {
  // --- Validate name ---
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Please give this analysis a name." };
  if (name.length > 80) {
    return { error: "Name must be 80 characters or fewer." };
  }

  // --- Validate current portfolio value ---
  const currentValueRaw = String(formData.get("current_value_usd") ?? "")
    .trim()
    .replace(/,/g, "");
  const currentValueUsd = Number(currentValueRaw);
  if (!Number.isFinite(currentValueUsd) || currentValueUsd <= 0) {
    return { error: "Current portfolio value must be a positive number." };
  }

  // --- Validate benchmarks (1..MAX_BENCHMARKS, deduped, ticker-shaped) ---
  const rawBenchmarks = formData.getAll("benchmarks").map(String);
  const benchmarks = Array.from(
    new Set(
      rawBenchmarks
        .map((b) => b.trim().toUpperCase())
        .filter((b) => TICKER_REGEX.test(b)),
    ),
  );
  if (benchmarks.length < 1 || benchmarks.length > MAX_BENCHMARKS) {
    return { error: `Pick 1 to ${MAX_BENCHMARKS} benchmark tickers.` };
  }

  // --- Validate CSV file ---
  const csv = formData.get("csv");
  if (!(csv instanceof File) || csv.size === 0) {
    return { error: "Please upload your Robinhood activity CSV." };
  }
  if (csv.size > MAX_CSV_BYTES) {
    return { error: "CSV is too large (max 10 MB)." };
  }
  // Browsers report .csv files variably. Accept common MIME types + empty.
  const allowedTypes = new Set([
    "text/csv",
    "application/vnd.ms-excel",
    "text/plain",
    "",
  ]);
  if (!allowedTypes.has(csv.type)) {
    return {
      error: `Unsupported file type "${csv.type}". Please upload a .csv file.`,
    };
  }

  // --- Auth ---
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // --- Insert first; the 5-row trigger may reject this. Cheap to abort. ---
  // Pre-generate the id so we can compute the storage path before insert.
  const analysisId = crypto.randomUUID();
  const storagePath = `${user.id}/${analysisId}.csv`;

  const { error: insertError } = await supabase.from("analyses").insert({
    id: analysisId,
    user_id: user.id,
    name,
    current_value_usd: currentValueUsd,
    benchmark_tickers: benchmarks,
    csv_storage_path: storagePath,
    status: "pending",
  });

  if (insertError) {
    if (insertError.message.includes("analysis_limit_reached")) {
      return {
        error: "You already have 5 saved analyses. Delete one to make room.",
      };
    }
    return { error: `Could not save analysis: ${insertError.message}` };
  }

  // --- Upload to storage; rollback the insert if this fails. ---
  const { error: uploadError } = await supabase.storage
    .from("csvs")
    .upload(storagePath, csv, {
      contentType: "text/csv",
      upsert: false,
    });

  if (uploadError) {
    // Best-effort cleanup. If this delete itself fails (rare), we'll have
    // an orphan `pending` row with no CSV — Phase 5's delete UI can mop up.
    await supabase.from("analyses").delete().eq("id", analysisId);
    return { error: `Could not upload CSV: ${uploadError.message}` };
  }

  redirect(`/dashboard/${analysisId}`);
}
