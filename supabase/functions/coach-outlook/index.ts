import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const MODEL = "gemini-2.5-flash";
const TARGET_EVENT = "Regional Games on 29 August";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function eventYear() {
  const now = new Date();
  const y = now.getFullYear();
  const target = new Date(`${y}-08-29T00:00:00`);
  return now > target ? y + 1 : y;
}

function strokeLabel(stroke: string) {
  return stroke === "breaststroke" ? "breaststroke" : "freestyle";
}

function extractJson(text: string) {
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

async function loadStrokeDataset(supabase: ReturnType<typeof createClient>, stroke: string) {
  let swimmers: Array<Record<string, unknown>> | null = null;
  {
    const first = await supabase.from("swimmers").select("id, name, last_active, created_at");
    if (first.error) {
      const fallback = await supabase.from("swimmers").select("id, name, last_active");
      if (fallback.error) throw new Error(fallback.error.message);
      swimmers = fallback.data || [];
    } else {
      swimmers = first.data || [];
    }
  }

  const { data, error } = await supabase
    .from("swim_times")
    .select("swimmer_id, time_sec, created_at")
    .eq("stroke", stroke)
    .eq("distance_m", 50)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const byId = new Map<string, {
    swimmer_id: unknown;
    name: string;
    registered_at: string | null;
    times: Array<{ time_sec: number; logged_at: string }>;
  }>();

  for (const s of swimmers || []) {
    byId.set(String(s.id), {
      swimmer_id: s.id,
      name: String(s.name || "Unknown"),
      registered_at: (s.created_at as string) || (s.last_active as string) || null,
      times: []
    });
  }

  for (const row of data || []) {
    const key = String(row.swimmer_id);
    let entry = byId.get(key);
    if (!entry) {
      entry = {
        swimmer_id: row.swimmer_id,
        name: "Unknown",
        registered_at: null,
        times: []
      };
      byId.set(key, entry);
    }
    entry.times.push({
      time_sec: Number(row.time_sec),
      logged_at: row.created_at
    });
  }

  return [...byId.values()]
    .filter((p) => p.times.length > 0)
    .map((p) => {
      const secs = p.times.map((t) => t.time_sec);
      const best = Math.min(...secs);
      const first = p.times[0];
      const latest = p.times[p.times.length - 1];
      return {
        ...p,
        best_time_sec: best,
        first_time_sec: first.time_sec,
        latest_time_sec: latest.time_sec,
        first_logged_at: first.logged_at,
        latest_logged_at: latest.logged_at,
        session_count: p.times.length
      };
    })
    .sort((a, b) => a.best_time_sec - b.best_time_sec);
}

function buildPayload(stroke: string, players: Awaited<ReturnType<typeof loadStrokeDataset>>) {
  return {
    stroke: strokeLabel(stroke),
    distance_m: 50,
    prediction_target: `${TARGET_EVENT} ${eventYear()}`,
    generated_at: new Date().toISOString(),
    athletes: players.map((p) => ({
      name: p.name,
      registered_at: p.registered_at,
      session_count: p.session_count,
      best_time_sec: p.best_time_sec,
      first_time_sec: p.first_time_sec,
      latest_time_sec: p.latest_time_sec,
      first_logged_at: p.first_logged_at,
      latest_logged_at: p.latest_logged_at,
      timed_sessions: p.times.map((t) => ({
        logged_at: t.logged_at,
        time_sec: t.time_sec
      }))
    }))
  };
}

async function callGemini(apiKey: string, stroke: string, players: Awaited<ReturnType<typeof loadStrokeDataset>>) {
  if (!players.length) {
    return {
      ok: false as const,
      error: `No ${strokeLabel(stroke)} times logged yet.`
    };
  }

  const payload = buildPayload(stroke, players);
  const prompt = `You are a strict, high-standard competitive swimming coach writing blunt athlete reviews for a corporate swim club preparing for the ${TARGET_EVENT} ${eventYear()}. Speak like a serious race coach: direct, demanding, and unsentimental. No encouragement fluff, no soft praise, no slang, no emojis, no hype.

Stroke focus: 50m ${payload.stroke}.

Using each athlete's registration timestamp and their dated 50m timed sessions (grouped below), produce:
1) A short team overview (2–3 sentences) on overall ${payload.stroke} readiness for 29 August. Call out weak attendance, plateaued times, and insufficient race preparedness where the data supports it.
2) One coach note per athlete: assess trajectory from their timed history, then give a realistic improvement outlook / predicted race readiness for 29 August. Hold athletes accountable for inconsistent logging, slow progress, or stagnant bests. State what must improve before 29 August.

Tone rules:
- Strict coach voice: firm, precise, and professional.
- Do not cushion criticism. If the data is weak, say so plainly.
- Credit real improvement only when times clearly show it — briefly, then raise the standard.
- Never invent excuses for the athlete.

Data rules:
- Base conclusions only on the provided times and dates. If data is sparse (1–2 swims), say the evidence is insufficient and keep the prediction cautious.
- Prefer specific seconds when predicting (e.g. "projected best around 34.5–35.0s").
- Do not invent sessions that are not in the data.
- Cover every athlete in the list.
- Keep each outlook to 1–2 concise sentences.
- Respond with compact JSON only. No markdown fences.

Return ONLY valid JSON with this shape:
{
  "overview": "string",
  "athletes": [
    {
      "name": "exact athlete name",
      "current_best_sec": number,
      "projected_aug29_sec": number or null,
      "outlook": "1–2 sentence strict coach summary"
    }
  ]
}

DATA:
${JSON.stringify(payload)}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: "application/json"
      }
    })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false as const,
      error: body?.error?.message || `Gemini HTTP ${res.status}`
    };
  }

  const text =
    body?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).filter(Boolean).join("\n") ||
    "";
  const parsed = extractJson(text);
  if (!parsed?.athletes || !Array.isArray(parsed.athletes)) {
    return { ok: false as const, error: "Gemini returned an unexpected format." };
  }

  return {
    ok: true as const,
    overview: typeof parsed.overview === "string" ? parsed.overview : "",
    summaries: parsed.athletes.map((a: Record<string, unknown>) => ({
      name: a.name,
      current_best_sec: a.current_best_sec != null ? Number(a.current_best_sec) : null,
      projected_aug29_sec: a.projected_aug29_sec != null ? Number(a.projected_aug29_sec) : null,
      outlook: a.outlook || ""
    })),
    generated_at: new Date().toISOString()
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  const geminiKey = Deno.env.get("GOOGLE_API_KEY") || Deno.env.get("GEMINI_API_KEY") || "";
  if (!geminiKey) {
    return json(500, {
      ok: false,
      error: "GOOGLE_API_KEY secret is not set on this Edge Function."
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return json(500, { ok: false, error: "Supabase env missing in Edge Function runtime." });
  }

  const authHeader = req.headers.get("Authorization") || `Bearer ${supabaseAnonKey}`;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  let stroke: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    stroke = body?.stroke;
  } catch {
    stroke = undefined;
  }

  const strokes =
    stroke === "freestyle" || stroke === "breaststroke"
      ? [stroke]
      : (["freestyle", "breaststroke"] as const);

  try {
    const boards: Record<string, unknown> = {};
    // Sequential calls reduce Gemini free-tier rate-limit collisions.
    for (const s of strokes) {
      const players = await loadStrokeDataset(supabase, s);
      boards[s] = await callGemini(geminiKey, s, players);
    }

    return json(200, { ok: true, boards });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Coach outlook failed.";
    return json(500, { ok: false, error: message });
  }
});
