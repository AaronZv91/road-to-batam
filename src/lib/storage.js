import { supabase } from './supabaseClient';

// Export functions individually so App.jsx can see them
export const getMembers = async () => {
  const { data, error } = await supabase
    .from('swimmers')
    .select('*')
    .order('total_meters', { ascending: false });
  return data || [];
};

export const addMember = async (name) => {
  const { data, error } = await supabase
    .from('swimmers')
    .insert([{ name, total_meters: 0, last_active: new Date().toISOString() }])
    .select();
  return data ? data[0] : null;
};

export const logSwim = async (memberId, meters) => {
  const id = Number(memberId);
  const { data: current } = await supabase
    .from('swimmers')
    .select('total_meters')
    .eq('id', Number.isFinite(id) ? id : memberId)
    .single();

  const newTotal = (current?.total_meters || 0) + meters;

  await supabase
    .from('swimmers')
    .update({ total_meters: newTotal, last_active: new Date().toISOString() })
    .eq('id', Number.isFinite(id) ? id : memberId);
};

// Add this to the bottom of src/lib/storage.js

export const subscribeToTeamRealtime = (onUpdate) => {
  const channel = supabase
    .channel('swimmers-updates')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'swimmers' },
      (payload) => onUpdate(payload)
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'swim_times' },
      (payload) => onUpdate(payload)
    )
    .subscribe(); // This must be at the end

  return channel;
};

/** 50m pool time for stroke leaderboard (requires `swim_times` table + RLS policies — see supabase_swim_times.sql). */
export const insertSwimTime50 = async (swimmerId, stroke, timeSec) => {
  if (swimmerId == null || swimmerId === "" || (stroke !== "freestyle" && stroke !== "breaststroke")) {
    return { ok: false, error: "Missing swimmer or stroke." };
  }
  const sid = Number(swimmerId);
  if (!Number.isFinite(sid)) {
    return { ok: false, error: "Invalid swimmer id." };
  }
  const t = Number(timeSec);
  if (!Number.isFinite(t) || t <= 0) {
    return { ok: false, error: "Enter a valid time in seconds." };
  }
  const { error } = await supabase.from("swim_times").insert({
    swimmer_id: sid,
    stroke,
    distance_m: 50,
    time_sec: t
  });
  if (error) {
    console.error("insertSwimTime50:", error.code, error.message, error.details);
    return { ok: false, error: error.message };
  }
  await supabase
    .from("swimmers")
    .update({ last_active: new Date().toISOString() })
    .eq("id", sid);
  return { ok: true };
};

function nameMapFromSwimmers(swimmers) {
  const map = {};
  for (const s of swimmers || []) {
    map[String(s.id)] = s.name;
  }
  return map;
}

export const getLeaderboard50m = async (stroke) => {
  const { data, error } = await supabase
    .from("swim_times")
    .select("swimmer_id, time_sec, created_at")
    .eq("stroke", stroke)
    .eq("distance_m", 50);
  if (error) {
    console.error("getLeaderboard50m:", error.code, error.message, error.details);
    return [];
  }
  if (!data?.length) return [];

  const best = new Map();
  for (const row of data) {
    const key = String(row.swimmer_id);
    const prev = best.get(key);
    const sec = Number(row.time_sec);
    if (!prev || sec < Number(prev.time_sec)) best.set(key, { ...row, swimmer_id: row.swimmer_id });
  }

  const { data: swimmers, error: swErr } = await supabase.from("swimmers").select("id, name");
  if (swErr) console.error("getLeaderboard50m swimmers:", swErr.message);
  const nameById = nameMapFromSwimmers(swimmers);

  return [...best.values()]
    .map((row) => ({
      swimmer_id: row.swimmer_id,
      name: nameById[String(row.swimmer_id)] || "Unknown",
      time_sec: Number(row.time_sec),
      created_at: row.created_at
    }))
    .sort((a, b) => a.time_sec - b.time_sec);
};

/** One swimmer's 50m times for a stroke, oldest → newest (for trend line). */
export const getSwimmerStrokeHistory = async (stroke, swimmerId, limit = 80) => {
  const sid = Number(swimmerId);
  if (!Number.isFinite(sid) || (stroke !== "freestyle" && stroke !== "breaststroke")) return [];
  const { data, error } = await supabase
    .from("swim_times")
    .select("time_sec, created_at")
    .eq("stroke", stroke)
    .eq("distance_m", 50)
    .eq("swimmer_id", sid)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("getSwimmerStrokeHistory:", error.code, error.message);
    return [];
  }
  return (data || []).map((r) => ({
    time_sec: Number(r.time_sec),
    created_at: r.created_at
  }));
};

/** Recent 50m swims for trending panel. */
export const getTrendingSwims = async (stroke, limit = 40) => {
  const { data, error } = await supabase
    .from("swim_times")
    .select("swimmer_id, time_sec, created_at")
    .eq("stroke", stroke)
    .eq("distance_m", 50)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getTrendingSwims:", error.code, error.message, error.details);
    return [];
  }
  if (!data?.length) return [];

  const { data: swimmers, error: swErr } = await supabase.from("swimmers").select("id, name");
  if (swErr) console.error("getTrendingSwims swimmers:", swErr.message);
  const nameById = nameMapFromSwimmers(swimmers);

  return data.map((row) => ({
    swimmer_id: row.swimmer_id,
    name: nameById[String(row.swimmer_id)] || "Unknown",
    time_sec: Number(row.time_sec),
    created_at: row.created_at
  }));
};