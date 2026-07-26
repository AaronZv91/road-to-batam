import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Waves, UserPlus, X, Sparkles, RefreshCw } from "lucide-react";
import {
  getMembers,
  addMember,
  logSwim,
  subscribeToTeamRealtime,
  insertSwimTime50,
  getLeaderboard50m,
  getSwimmerStrokeHistory
} from "./lib/storage";
import { fetchCoachOutlook } from "./lib/geminiCoach";

function getDaysToGames() {
  const now = new Date();
  const year = now.getFullYear();
  const target = new Date(`${year}-08-29T00:00:00`);
  const finalTarget = now > target ? new Date(`${year + 1}-08-29T00:00:00`) : target;
  const diff = finalTarget.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

const MISSION_MAX_M = 500000;

function formatSwimTime(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${n.toFixed(2)}s`;
}

function CoachSummaryBoard({ title, report, loading, error, onRefresh }) {
  const label = title.toLowerCase().includes("breast") ? "breaststroke" : "freestyle";
  return (
    <motion.div className="game-card rounded-2xl p-4" layout>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="battle-subtitle">
          <div className="flex items-center gap-2">
            <Sparkles size={16} />
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">{title}</h2>
          </div>
          <p className="mt-1 text-[11px] normal-case tracking-normal text-slate-400">
            AI coach outlook for 29 Aug from registered athletes and dated 50m {label} times.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/50 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-wait disabled:opacity-60"
          aria-label="Refresh coach outlook"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <p className="mb-2 rounded-lg border border-red-400/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">{error}</p>
      )}

      {loading && !report && (
        <p className="py-6 text-center text-sm text-cyan-200/80">Loading coach outlook…</p>
      )}

      {!loading && !report && !error && (
        <p className="text-xs text-slate-400">No coach outlook available yet.</p>
      )}

      {report && (
        <div className="space-y-3">
          {report.overview && (
            <p className="rounded-lg border border-cyan-300/20 bg-slate-950/50 px-3 py-2 text-sm leading-relaxed text-slate-200">
              {report.overview}
            </p>
          )}
          <ul className="leaderboard-scroll space-y-2 text-sm">
            {(report.summaries || []).map((row, i) => (
              <li
                key={`${row.name}-${i}`}
                className="rounded-lg border border-cyan-300/20 bg-slate-900/50 px-3 py-2.5"
              >
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-cyan-100">{row.name}</span>
                  <span className="font-mono text-[11px] text-slate-400">
                    Best {formatSwimTime(row.current_best_sec)}
                    {row.projected_aug29_sec != null && Number.isFinite(row.projected_aug29_sec) && (
                      <>
                        {" "}
                        · Aug 29 proj.{" "}
                        <span className="text-neon">{formatSwimTime(row.projected_aug29_sec)}</span>
                      </>
                    )}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-300">{row.outlook}</p>
              </li>
            ))}
          </ul>
          {report.generated_at && (
            <p className="text-[10px] text-slate-500">
              Generated {new Date(report.generated_at).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
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

export default function App() {
  const [state, setState] = useState({ team: [], logs: [] });
  const [selectedId, setSelectedId] = useState("");
  const [meters, setMeters] = useState("");
  const [joinName, setJoinName] = useState("");
  const [stroke, setStroke] = useState("freestyle");
  const [timeSec, setTimeSec] = useState("");
  const [splashKey, setSplashKey] = useState(0);
  const [days, setDays] = useState(() => getDaysToGames());
  const [free50Board, setFree50Board] = useState([]);
  const [breast50Board, setBreast50Board] = useState([]);
  const [chartModal, setChartModal] = useState(null);
  const [chartPoints, setChartPoints] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [swimLogHint, setSwimLogHint] = useState(null);
  const [freeCoach, setFreeCoach] = useState(null);
  const [breastCoach, setBreastCoach] = useState(null);
  const [freeCoachLoading, setFreeCoachLoading] = useState(false);
  const [breastCoachLoading, setBreastCoachLoading] = useState(false);
  const [freeCoachError, setFreeCoachError] = useState(null);
  const [breastCoachError, setBreastCoachError] = useState(null);

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

  async function loadCoachBoards() {
    setFreeCoachLoading(true);
    setBreastCoachLoading(true);
    setFreeCoachError(null);
    setBreastCoachError(null);
    try {
      const result = await fetchCoachOutlook();
      if (!result.ok) {
        setFreeCoachError(result.error);
        setBreastCoachError(result.error);
        return;
      }
      const boards = result.boards || {};

      const applyBoard = (stroke, setReport, setError) => {
        const board = boards[stroke];
        if (!board) {
          setError(`No ${stroke} outlook returned.`);
          return;
        }
        if (!board.ok) {
          setError(board.error || `Could not build ${stroke} outlook.`);
          return;
        }
        setReport({
          overview: board.overview,
          summaries: board.summaries,
          generated_at: board.generated_at
        });
      };

      applyBoard("freestyle", setFreeCoach, setFreeCoachError);
      applyBoard("breaststroke", setBreastCoach, setBreastCoachError);
    } catch (e) {
      const msg = e?.message || "Failed to load coach outlook.";
      setFreeCoachError(msg);
      setBreastCoachError(msg);
    } finally {
      setFreeCoachLoading(false);
      setBreastCoachLoading(false);
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

    loadCoachBoards().catch((error) => {
      console.error("Failed to load coach outlook:", error);
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

  const totalKm = useMemo(() => state.team.reduce((acc, n) => acc + n.totalKm, 0), [state.team]);
  const currentMeters = Math.round(totalKm * 1000);
  const barPct = Math.min((currentMeters / MISSION_MAX_M) * 100, 100);

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

  return (
    <div className="min-h-screen px-4 py-6 md:px-8">
      <motion.header
        className="game-card mx-auto mb-6 max-w-6xl rounded-2xl p-5"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <p className="battle-subtitle text-xs uppercase tracking-[0.3em]">Road to Batam</p>
          <h1 className="battle-title mt-1 text-2xl font-bold md:text-3xl">
            Mission: Regional Games | August 29th | {days} Days To Go
          </h1>
        </div>
      </motion.header>

      <main className="mx-auto max-w-6xl space-y-6">
        <section className="grid gap-6 lg:grid-cols-2">
          <motion.div className="game-card rounded-2xl p-4" layout>
            <div className="battle-subtitle mb-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Fastest Freestyle (50m)</h2>
            </div>
            {free50Board.length === 0 ? (
              <p className="text-xs text-slate-400">No 50m freestyle times yet.</p>
            ) : (
              <ul className="leaderboard-scroll space-y-1.5 text-sm">
                {free50Board.map((row, i) => (
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
              <ul className="leaderboard-scroll space-y-1.5 text-sm">
                {breast50Board.map((row, i) => (
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

        <section className="grid gap-6 lg:grid-cols-2">
          <CoachSummaryBoard
            title="Coach Outlook — Freestyle"
            report={freeCoach}
            loading={freeCoachLoading}
            error={freeCoachError}
            onRefresh={loadCoachBoards}
          />
          <CoachSummaryBoard
            title="Coach Outlook — Breaststroke"
            report={breastCoach}
            loading={breastCoachLoading}
            error={breastCoachError}
            onRefresh={loadCoachBoards}
          />
        </section>

        <section>
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
