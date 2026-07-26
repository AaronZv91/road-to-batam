const MODEL = "gemini-2.0-flash";
const TARGET_EVENT = "Regional Games on 29 August";

function apiKey() {
  return import.meta.env.VITE_GOOGLE_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || "";
}

function eventYear() {
  const now = new Date();
  const y = now.getFullYear();
  const target = new Date(`${y}-08-29T00:00:00`);
  return now > target ? y + 1 : y;
}

function strokeLabel(stroke) {
  return stroke === "breaststroke" ? "breaststroke" : "freestyle";
}

/**
 * Build a compact payload for Gemini: registration + dated 50m times per swimmer.
 */
export function buildCoachPayload(stroke, players) {
  return {
    stroke: strokeLabel(stroke),
    distance_m: 50,
    prediction_target: `${TARGET_EVENT} ${eventYear()}`,
    generated_at: new Date().toISOString(),
    athletes: (players || []).map((p) => ({
      name: p.name,
      registered_at: p.registered_at,
      session_count: p.session_count,
      best_time_sec: p.best_time_sec,
      first_time_sec: p.first_time_sec,
      latest_time_sec: p.latest_time_sec,
      first_logged_at: p.first_logged_at,
      latest_logged_at: p.latest_logged_at,
      timed_sessions: (p.times || []).map((t) => ({
        logged_at: t.logged_at,
        time_sec: t.time_sec
      }))
    }))
  };
}

function extractJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* continue */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Ask Gemini for a professional coach outlook per athlete toward Aug 29.
 * @returns {{ ok: true, summaries: Array, overview: string } | { ok: false, error: string }}
 */
export async function generateStrokeCoachSummary(stroke, players) {
  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      error: "Missing VITE_GOOGLE_API_KEY in .env (restart the dev server after adding it)."
    };
  }
  if (!players?.length) {
    return { ok: false, error: `No ${strokeLabel(stroke)} times logged yet.` };
  }

  const payload = buildCoachPayload(stroke, players);
  const prompt = `You are an experienced competitive swimming coach writing brief, professional athlete reviews for a corporate swim club preparing for the ${TARGET_EVENT} ${eventYear()}.

Stroke focus: 50m ${payload.stroke}.

Using each athlete's registration timestamp and their dated 50m timed sessions (grouped below), produce:
1) A short team overview (2–3 sentences) on overall ${payload.stroke} readiness for 29 August.
2) One coach note per athlete: assess trajectory from their timed history, then give a realistic improvement outlook / predicted race readiness for 29 August. Tone: professional coach — clear, constructive, no slang, no emojis, no hype.

Rules:
- Base conclusions only on the provided times and dates. If data is sparse (1–2 swims), say so and keep the prediction cautious.
- Prefer specific seconds when predicting (e.g. "projected best around 34.5–35.0s").
- Do not invent sessions that are not in the data.
- Cover every athlete in the list.

Return ONLY valid JSON with this shape:
{
  "overview": "string",
  "athletes": [
    {
      "name": "exact athlete name",
      "current_best_sec": number,
      "projected_aug29_sec": number or null,
      "outlook": "2–4 sentence professional coach summary"
    }
  ]
}

DATA:
${JSON.stringify(payload)}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4096,
          responseMimeType: "application/json"
        }
      })
    });
  } catch (e) {
    return { ok: false, error: e?.message || "Network error calling Gemini." };
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || `Gemini HTTP ${res.status}`;
    return { ok: false, error: msg };
  }

  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("\n") || "";
  const parsed = extractJson(text);
  if (!parsed?.athletes || !Array.isArray(parsed.athletes)) {
    return { ok: false, error: "Gemini returned an unexpected format. Try again." };
  }

  return {
    ok: true,
    overview: typeof parsed.overview === "string" ? parsed.overview : "",
    summaries: parsed.athletes.map((a) => ({
      name: a.name,
      current_best_sec: a.current_best_sec != null ? Number(a.current_best_sec) : null,
      projected_aug29_sec: a.projected_aug29_sec != null ? Number(a.projected_aug29_sec) : null,
      outlook: a.outlook || ""
    })),
    generated_at: new Date().toISOString()
  };
}
