import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Waves,
  Timer,
  UserPlus,
  Milestone,
  Medal
} from "lucide-react";
import { getMembers, addMember, logSwim, subscribeToTeamRealtime } from "./lib/storage";
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
  const target = new Date(`${year}-08-30T00:00:00`);
  const finalTarget = now > target ? new Date(`${year + 1}-08-30T00:00:00`) : target;
  const diff = finalTarget.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getStage(km) {
  return STAGES.find((stage) => km <= stage.max) ?? STAGES[STAGES.length - 1];
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
  const [splashKey, setSplashKey] = useState(0);
  const [podBoost, setPodBoost] = useState(0);
  const [days, setDays] = useState(() => getDaysToGames());

  function toUiMember(row) {
    return {
      id: row.id,
      name: row.name,
      totalKm: Number(((row.total_meters ?? 0) / 1000).toFixed(2)),
      lastLoggedAt: row.last_active ? new Date(row.last_active).getTime() : 0
    };
  }

  async function refreshMembers() {
    const rows = await getMembers();
    const members = rows.map(toUiMember);
    setState((prev) => ({ ...prev, team: members }));
    setSelectedId((prev) => prev || members[0]?.id || "");
  }

  useEffect(() => {
    refreshMembers().catch((error) => {
      console.error("Failed to load members:", error);
    });

    const channel = subscribeToTeamRealtime(() => {
      refreshMembers().catch((error) => {
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
  const activeStage = getStage(totalKm);

  async function handleLogSwim(e) {
    e.preventDefault();
    const metersValue = Number(meters);
    if (!selectedId || !metersValue || metersValue <= 0) return;
    await logSwim(selectedId, metersValue);
    await refreshMembers();

    setMeters("");
    setSplashKey((k) => k + 1);
    setPodBoost((k) => k + 1);
  }

  async function joinMission() {
    const trimmed = joinName.trim();
    if (!trimmed) return;
    const exists = state.team.some((m) => m.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) return;
    const created = await addMember(trimmed);
    await refreshMembers();
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
              Mission: Regional Games | August 30th | {days} Days To Go
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
            <form onSubmit={handleLogSwim} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="rounded-lg border border-cyan-300/30 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
              >
                {state.team.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={meters}
                onChange={(e) => setMeters(e.target.value)}
                placeholder="Distance (meters)"
                className="rounded-lg border border-cyan-300/30 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
              />
              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.97 }}
                className="battle-button rounded-xl px-4 py-2 text-sm font-semibold transition hover:brightness-110"
              >
                Wall Push-off
              </motion.button>
            </form>

            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                placeholder="New teammate name"
                className="rounded-lg border border-cyan-300/30 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
              />
              <button
                onClick={joinMission}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/60 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
              >
                <UserPlus size={15} /> Join the Mission
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-cyan-200/80">
              <span>0m</span>
              <span>500000m</span>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={splashKey}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.12, opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800"
              >
                <motion.div
                  initial={{ width: "0%" }}
                  animate={{ width: `${Math.min((totalKm * 1000 / 500000) * 100, 100)}%` }}
                  className="h-full bg-neon"
                />
              </motion.div>
            </AnimatePresence>
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
              <Trophy size={18} />
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Leaderboard</h2>
            </div>
            <div className="space-y-2">
              {sorted.map((swimmer, idx) => (
                <motion.div
                  key={swimmer.id}
                  className="flex items-center justify-between rounded-xl border border-cyan-300/30 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
                  whileHover={{ scale: 1.015 }}
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
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>
      </main>
    </div>
  );
}
