import { supabase } from "./supabaseClient";

/**
 * Call the `coach-outlook` Supabase Edge Function.
 * Gemini key stays server-side (Edge Function secret: GOOGLE_API_KEY).
 *
 * @param {("freestyle"|"breaststroke"|undefined)} stroke
 *   Omit to load both freestyle and breaststroke in one request.
 */
export async function fetchCoachOutlook(stroke) {
  const body =
    stroke === "freestyle" || stroke === "breaststroke" ? { stroke } : {};

  const { data, error } = await supabase.functions.invoke("coach-outlook", {
    body
  });

  if (error) {
    return {
      ok: false,
      error: error.message || "Edge Function invoke failed."
    };
  }

  if (!data?.ok) {
    return {
      ok: false,
      error: data?.error || "Coach outlook returned an error."
    };
  }

  return {
    ok: true,
    boards: data.boards || {}
  };
}
