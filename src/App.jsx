import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Waves,
  Timer,
  UserPlus,
  Milestone,
  Medal,
  X
} from "lucide-react";
import {
  getMembers,
  addMember,
  logSwim,
  subscribeToTeamRealtime,
  insertSwimTime50,
  getLeaderboard50m,
  getSwimmerStrokeHistory
} from "./lib/storage";
import OSMExpeditionMap from "./components/OSMExpeditionMap";

const GOAL_KM = 500;
const ACTIVE_WINDOW_MS = 48 * 60 * 60 * 1000;
const STAGES = [
  { name: "The First Splash", range: "0-100km", detail: "Eastern Coastline Route", max: 100 },
  { name: "Cruise Interval", range: "100-250km", detail: "Southern Industrial Route", max: 250 },
  { name: "The Swell Challenge", range: "250-450km", detail: "Northern Strait Loop", max: 450 },
  { name: "The Final Sprint", range: "450-500km", detail: "Crossing the Strait to the Batam Finish Line", max: 500 }
];

function getDaysToGames() {
  const now = new Date();
  const year = now.getFullYear();
  const target = new Date(`${year}-08-29T00:00:00`);
  const finalTarget = now > target ? new Date(`${year + 1}-08-29T00:00:00`) : target;
  const diff = finalTarget.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getStage(km) {
  return STAGES.find((stage) => km <= stage.max) ?? STAGES[STAGES.length - 1];
}

const MISSION_MAX_M = 500000;

function formatSwimTime(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${n.toFixed(2)}s`;
}

function StrokeTrendChart({ points, width = 360, height = 200 }) {
  if (!points?.length) {
    return <p className="py-8 text-center text-sm text-slate-400">No swims to plot yet.</p>;
  }
  const pad = { l: 52, r: 14, t: 28, b: 40 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const vals = points.map((p) => p.time_sec);
  const minT = Math.min(...vals);
  const maxT = Math.max(...vals);
  const spread = Math.max(maxT - minT, 1e-6);

  const coords = points.map((p, i) => {
    const x = pad.l + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = pad.t + ((p.time_sec - minT) / spread) * innerH;
    return { x, y, p };
  });

  const linePts = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto w-full max-w-md" role="img" aria-label="Time trend chart">
      {[0, 0.5, 1].map((g) => {
        const y = pad.t + g * innerH;
        return (
          <line
            key={g}
            x1={pad.l}
            y1={y}
            x2={width - pad.r}
            y2={y}
            stroke="#334155"
            strokeWidth="1"
            strokeDasharray="5 6"
          />
        );
      })}
      <text x={pad.l} y={16} fill="#94a3b8" fontSize="11" fontFamily="inherit">
        Faster toward top · seconds
      </text>
      <text x={pad.l} y={height - 12} fill="#64748b" fontSize="10" fontFamily="inherit">
        Older ← — → Newer
      </text>
      <text x={8} y={pad.t + 14} fill="#7dd3fc" fontSize="10" fontFamily="inherit">
        {minT.toFixed(2)}s
      </text>
      <text x={8} y={pad.t + innerH - 2} fill="#7dd3fc" fontSize="10" fontFamily="inherit">
        {maxT.toFixed(2)}s
      </text>
      {coords.length > 1 && (
        <polyline
          fill="none"
          stroke="#4ade80"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={linePts}
        />
      )}
      {coords.map((c, i) => (
        <circle
          key={`${c.p.created_at}-${i}`}
          cx={c.x}
          cy={c.y}
          r={coords.length === 1 ? 8 : 5}
          fill="#22d3ee"
          stroke="#0f172a"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}

function TeamCircle({ swimmers }) {
  const radius = swimmers.length > 16 ? 160 : 130;
  return (
    <div className="relative mx-auto h-[360px] w-full max-w-[360px]">
      <div className="absolute inset-0 m-auto h-40 w-40 rounded-full border-2 border-cyan-500/40 bg-cyan-950/30 blur-[1px]" />
      <motion.div
        className="absolute inset-0 m-auto flex h-40 w-40 items-center justify-center rounded-full border-2 border-cyan-400/60 bg-slate-900/80 shadow-glow"
        animate={{ scale: [1, 1.02, 1] }}
        transition={{ repeat: Infinity, duration: 2.5 }}
      >
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Team Core</p>
          <p className="mt-1 text-2xl font-bold text-cyan-100">{swimmers.length}</p>
        </div>
      </motion.div>
      {swimmers.map((swimmer, i) => {
        const angle = (i / swimmers.length) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * radius + 180;
        const y = Math.sin(angle) * radius + 180;
        const isActive = Date.now() - swimmer.lastLoggedAt <= ACTIVE_WINDOW_MS;
        return (
          <motion.div
            key={swimmer.id}
            className="absolute"
            animate={{ x: x - 14, y: y - 14 }}
            transition={{ type: "spring", stiffness: 120, damping: 16 }}
          >
            <motion.div
              className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${
                isActive
                  ? "border-cyan-100 bg-electric text-white shadow-glow"
                  : "border-slate-400 bg-slate-600 text-slate-200"
              }`}
              animate={isActive ? { scale: [1, 1.15, 1], opacity: [1, 0.85, 1] } : {}}
              transition={isActive ? { repeat: Infinity, duration: 1.8 } : {}}
              title={`${swimmer.name} · ${swimmer.totalKm.toFixed(2)}km`}
            >
              <span className="text-[10px] font-bold">{swimmer.name.slice(0, 1)}</span>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [state, setState] = useState({ team: [], logs: [] });
  const [selectedId, setSelectedId] = useState("");
  const [meters, setMeters] = useState("");
  const [joinName, setJoinName] = useState("");
  const [stroke, setStroke] = useState("freestyle");
  const [timeSec, setTimeSec] = useState("");
  const [splashKey, setSplashKey] = useState(0);
  const [podBoost, setPodBoost] = useState(0);
  const [days, setDays] = useState(() => getDaysToGames());
  const [free50Board, setFree50Board] = useState([]);
  const [breast50Board, setBreast50Board] = useState([]);
  const [chartModal, setChartModal] = useState(null);
  const [chartPoints, setChartPoints] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [swimLogHint, setSwimLogHint] = useState(null);

  function toUiMember(row) {
    return {
      id: row.id,
      name: row.name,
      totalKm: Number(((row.total_meters ?? 0) / 1000).toFixed(2)),
      lastLoggedAt: row.last_active ? new Date(row.last_active).getTime() : 0
    };
  }

  async function loadStrokeLeaderboards() {
    try {
      const [f, b] = await Promise.all([getLeaderboard50m("freestyle"), getLeaderboard50m("breaststroke")]);
      setFree50Board(f);
      setBreast50Board(b);
    } catch (e) {
      console.error("Stroke leaderboards:", e);
      setFree50Board([]);
      setBreast50Board([]);
    }
  }

  async function openSwimmerChart(stroke, swimmerId, name) {
    setChartModal({ stroke, swimmerId, name });
    setChartPoints([]);
    setChartLoading(true);
    try {
      const rows = await getSwimmerStrokeHistory(stroke, swimmerId, 80);
      setChartPoints(rows);
    } catch (e) {
      console.error("Swimmer chart:", e);
      setChartPoints([]);
    } finally {
      setChartLoading(false);
    }
  }

  function closeSwimmerChart() {
    setChartModal(null);
    setChartPoints([]);
  }

  async function refreshMembers() {
    const rows = await getMembers();
    const members = rows.map(toUiMember);
    setState((prev) => ({ ...prev, team: members }));
    setSelectedId((prev) => prev || members[0]?.id || "");
  }

  useEffect(() => {
    refreshMembers()
      .then(() => loadStrokeLeaderboards())
      .catch((error) => {
        console.error("Failed to load members:", error);
      });

    const channel = subscribeToTeamRealtime(() => {
      refreshMembers()
        .then(() => loadStrokeLeaderboards())
        .catch((error) => {
          console.error("Realtime refresh failed:", error);
        });
    });

    return () => {
      if (channel?.unsubscribe) channel.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const refresh = () => setDays(getDaysToGames());
    refresh();
    const timer = setInterval(refresh, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const sorted = useMemo(
    () => [...state.team].sort((a, b) => b.totalKm - a.totalKm),
    [state.team]
  );
  const totalKm = useMemo(() => state.team.reduce((acc, n) => acc + n.totalKm, 0), [state.team]);
  const currentMeters = Math.round(totalKm * 1000);
  const barPct = Math.min((currentMeters / MISSION_MAX_M) * 100, 100);
  const activeStage = getStage(totalKm);

  async function handleLogSwim(e) {
    e.preventDefault();
    if (!selectedId) return;

    const metersValue = Number(meters);
    const hasDistance = meters !== "" && Number.isFinite(metersValue) && metersValue > 0;

    const ts = Number(timeSec);
    const hasTime = timeSec !== "" && Number.isFinite(ts) && ts > 0;

    if (!hasDistance && !hasTime) return;

    setSwimLogHint(null);

    if (hasDistance) {
      await logSwim(selectedId, metersValue);
    }

    let timeInsertOk = true;
    if (hasTime) {
      const res = await insertSwimTime50(selectedId, stroke, ts);
      timeInsertOk = res.ok;
      if (!res.ok) {
        setSwimLogHint({
          type: "error",
          text: res.error || "Could not save 50m time. Check Supabase RLS on swim_times (see supabase_swim_times.sql)."
        });
      } else {
        setSwimLogHint({
          type: "info",
          text: hasDistance
            ? "50m time saved to leaderboards. Distance added to team total."
            : "50m time saved to leaderboards (no training distance logged)."
        });
      }
    }

    await refreshMembers();
    await loadStrokeLeaderboards();

    if (hasDistance) setMeters("");
    if (hasTime && timeInsertOk) setTimeSec("");
    if (hasDistance || (hasTime && timeInsertOk)) {
      setSplashKey((k) => k + 1);
      setPodBoost((k) => k + 1);
    }
  }

  async function joinMission() {
    const trimmed = joinName.trim();
    if (!trimmed) return;
    const exists = state.team.some((m) => m.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) return;
    const created = await addMember(trimmed);
    await refreshMembers();
    await loadStrokeLeaderboards();
    if (created) setSelectedId(created.id);
    setJoinName("");
  }

  const badgeThemes = [
    "border-amber-300 bg-amber-500/20 text-amber-100",
    "border-slate-300 bg-slate-400/20 text-slate-100",
    "border-orange-400 bg-orange-500/20 text-orange-100"
  ];

  return (
    <div className="min-h-screen px-4 py-6 md:px-8">
      <motion.header
        className="game-card mx-auto mb-6 max-w-6xl rounded-2xl p-5"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="battle-subtitle text-xs uppercase tracking-[0.3em]">Road to Batam</p>
            <h1 className="battle-title mt-1 text-2xl font-bold md:text-3xl">
              Mission: Regional Games | August 29th | {days} Days To Go
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-neon/60 bg-neon/10 px-4 py-2 text-neon shadow-green">
            <Timer size={16} />
            <span className="text-sm font-semibold">500km Team Target</span>
          </div>
        </div>
      </motion.header>

      <main className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="space-y-6">
          <OSMExpeditionMap
            progressKm={totalKm}
            goalKm={GOAL_KM}
            stageLabel={`${activeStage.name} · ${activeStage.detail}`}
            boostSignal={podBoost}
          />

          <motion.div className="game-card rounded-2xl p-4" layout>
            <div className="battle-subtitle mb-4 flex items-center gap-2">
              <Waves size={18} />
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Log Distance</h2>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-cyan-400/25 bg-slate-950/50 p-4 shadow-[inset_0_1px_0_rgba(186,230,253,0.06)]">
                <form onSubmit={handleLogSwim} className="space-y-5">
                  <div className="space-y-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/90">Mandatory</h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
                      <div className="lg:col-span-3">
                        <label className="mb-1 block text-[10px] uppercase tracking-wider text-cyan-300/80">Swimmer</label>
                        <select
                          value={selectedId}
                          onChange={(e) => setSelectedId(e.target.value)}
                          className="w-full rounded-lg border border-cyan-300/30 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
                        >
                          {state.team.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="lg:col-span-2">
                        <label className="mb-1 block text-[10px] uppercase tracking-wider text-cyan-300/80">
                          Distance (Meter)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={meters}
                          onChange={(e) => setMeters(e.target.value)}
                          className="w-full rounded-lg border border-cyan-300/30 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/90">
                      Record if available
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
                      <div className="lg:col-span-3">
                        <label className="mb-1 block text-[10px] uppercase tracking-wider text-cyan-300/80">Stroke</label>
                        <select
                          value={stroke}
                          onChange={(e) => setStroke(e.target.value)}
                          className="w-full rounded-lg border border-cyan-300/30 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
                        >
                          <option value="freestyle">Freestyle</option>
                          <option value="breaststroke">Breaststroke</option>
                        </select>
                      </div>
                      <div className="lg:col-span-2">
                        <label className="mb-1 block text-[10px] uppercase tracking-wider text-cyan-300/80">Time (sec)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={timeSec}
                          onChange={(e) => setTimeSec(e.target.value)}
                          className="w-full rounded-lg border border-cyan-300/30 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
                        />
                      </div>
                      <div className="flex items-end sm:col-span-2 lg:col-span-7">
                        <motion.button
                          type="submit"
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.97 }}
                          className="battle-button w-full rounded-xl px-4 py-2 text-sm font-semibold transition hover:brightness-110 lg:ml-auto lg:w-auto lg:min-w-[11rem]"
                        >
                          Wall Push-off
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </form>
                <p className="mt-3 text-[11px] text-slate-400">
                  <span className="text-cyan-300">Distance</span>, when entered, adds to the team 500km total.{" "}
                  <span className="text-cyan-300">Stroke + time</span> alone saves a <span className="text-cyan-300">50m</span>{" "}
                  trial to the leaderboards without logging distance. If you enter both, they are independent.
                </p>
                {swimLogHint && (
                  <p
                    className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
                      swimLogHint.type === "error"
                        ? "border-red-400/50 bg-red-950/40 text-red-200"
                        : "border-cyan-400/40 bg-cyan-950/30 text-cyan-100"
                    }`}
                  >
                    {swimLogHint.text}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-cyan-400/25 bg-slate-950/50 p-4 shadow-[inset_0_1px_0_rgba(186,230,253,0.06)]">
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/90">Register</h3>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    value={joinName}
                    onChange={(e) => setJoinName(e.target.value)}
                    placeholder="New teammate name"
                    className="rounded-lg border border-cyan-300/30 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={joinMission}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/60 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
                  >
                    <UserPlus size={15} /> Join the Mission
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between text-[11px] text-cyan-200/80">
              <span>0m</span>
              <span>{MISSION_MAX_M.toLocaleString()}m</span>
            </div>
            <p className="mt-2 text-center text-sm font-semibold text-cyan-200">
              Current: {currentMeters.toLocaleString()} m
            </p>
            <div className="relative mt-1 h-4 w-full">
              <div className="absolute inset-0 rounded-full bg-slate-800" />
              <motion.div
                key={splashKey}
                className="absolute left-0 top-0 h-4 rounded-full bg-neon shadow-[0_0_12px_rgba(34,197,94,0.45)]"
                initial={{ width: 0 }}
                animate={{ width: `${barPct}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 18 }}
              />
              <div
                className="pointer-events-none absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-cyan-300 shadow-[0_0_14px_#22d3ee,0_0_8px_#a5f3fc]"
                style={{ left: `${barPct}%` }}
              />
            </div>
          </motion.div>
        </section>

        <section className="space-y-6">
          <motion.div className="game-card relative overflow-hidden rounded-2xl p-4" layout>
            <motion.div
              className="pointer-events-none absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-300/30"
              animate={{ scale: [0.92, 1.08, 0.92], opacity: [0.25, 0.45, 0.25] }}
              transition={{ repeat: Infinity, duration: 1.8 }}
            />
            <motion.div
              className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-300/40"
              animate={{ scale: [0.95, 1.12, 0.95], opacity: [0.25, 0.45, 0.25] }}
              transition={{ repeat: Infinity, duration: 2.3 }}
            />
            <div className="battle-subtitle relative mb-2 flex items-center gap-2">
              <Milestone size={18} />
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Team Core Dynamics</h2>
            </div>
            <div className="relative">
              <TeamCircle swimmers={state.team} />
            </div>
            <p className="battle-subtitle text-center text-xs">
              Electric Blue pulse = logged within last 48 hours
            </p>
          </motion.div>

          <motion.div className="game-card rounded-2xl p-4" layout>
            <div className="battle-subtitle mb-3 flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Trophy size={18} />
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Lead Shark</h2>
              </div>
            </div>
            <div className="space-y-2">
              {sorted.slice(0, 6).map((swimmer, idx) => (
                <div
                  key={swimmer.id}
                  className="flex items-center justify-between rounded-xl border border-cyan-300/30 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-300">{idx + 1}</span>
                    <span className="font-medium">{swimmer.name}</span>
                    {idx < 3 && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-lg border-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${badgeThemes[idx]}`}
                      >
                        <Medal size={11} /> Lead Shark
                      </span>
                    )}
                  </div>
                  <span className="font-semibold text-neon">{swimmer.totalKm.toFixed(2)} km</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div className="game-card rounded-2xl p-4" layout>
            <div className="battle-subtitle mb-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Fastest Freestyle (50m)</h2>
            </div>
            {free50Board.length === 0 ? (
              <p className="text-xs text-slate-400">No 50m freestyle times yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {free50Board.slice(0, 6).map((row, i) => (
                  <li key={`${row.swimmer_id}-${i}`} className="flex justify-between rounded-lg border border-cyan-300/20 bg-slate-900/50 px-2 py-1.5">
                    <span className="text-cyan-200">
                      {i + 1}.{" "}
                      <button
                        type="button"
                        className="font-medium text-cyan-100 underline decoration-cyan-500/60 decoration-2 underline-offset-2 hover:text-white"
                        onClick={() => openSwimmerChart("freestyle", row.swimmer_id, row.name)}
                      >
                        {row.name}
                      </button>
                    </span>
                    <span className="font-mono font-semibold text-neon">{formatSwimTime(row.time_sec)}</span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>

          <motion.div className="game-card rounded-2xl p-4" layout>
            <div className="battle-subtitle mb-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Fastest Breaststroke (50m)</h2>
            </div>
            {breast50Board.length === 0 ? (
              <p className="text-xs text-slate-400">No 50m breaststroke times yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {breast50Board.slice(0, 6).map((row, i) => (
                  <li key={`${row.swimmer_id}-b-${i}`} className="flex justify-between rounded-lg border border-cyan-300/20 bg-slate-900/50 px-2 py-1.5">
                    <span className="text-cyan-200">
                      {i + 1}.{" "}
                      <button
                        type="button"
                        className="font-medium text-cyan-100 underline decoration-cyan-500/60 decoration-2 underline-offset-2 hover:text-white"
                        onClick={() => openSwimmerChart("breaststroke", row.swimmer_id, row.name)}
                      >
                        {row.name}
                      </button>
                    </span>
                    <span className="font-mono font-semibold text-neon">{formatSwimTime(row.time_sec)}</span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </section>
      </main>

      <AnimatePresence>
        {chartModal && (
          <motion.div
            key="chart-overlay"
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSwimmerChart}
          >
            <motion.div
              key={`${chartModal.swimmer_id}-${chartModal.stroke}`}
              className="game-card relative z-[10001] max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl p-5 shadow-2xl"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {chartModal.name} — {chartModal.stroke === "freestyle" ? "Freestyle" : "Breaststroke"} 50m trend
                  </h3>
                  <p className="text-xs text-slate-400">Each point is a logged 50m time, left to right by date.</p>
                </div>
                <button
                  type="button"
                  onClick={closeSwimmerChart}
                  className="rounded-lg border border-cyan-400/40 p-1.5 text-cyan-200 hover:bg-cyan-500/10"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="rounded-xl border border-cyan-300/20 bg-slate-950/50 p-3">
                {chartLoading ? (
                  <p className="py-10 text-center text-sm text-cyan-200">Loading chart…</p>
                ) : (
                  <StrokeTrendChart points={chartPoints} />
                )}
              </div>
              {!chartLoading && chartPoints.length > 0 && (
                <div className="mt-4 max-h-40 overflow-y-auto rounded-lg border border-cyan-300/15 bg-slate-900/60">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="sticky top-0 bg-slate-900/95 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-2 py-1.5">Date</th>
                        <th className="px-2 py-1.5 text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...chartPoints].reverse().map((pt) => (
                        <tr key={pt.created_at} className="border-t border-slate-700/80">
                          <td className="px-2 py-1">{new Date(pt.created_at).toLocaleString()}</td>
                          <td className="px-2 py-1 text-right font-mono text-neon">{formatSwimTime(pt.time_sec)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
