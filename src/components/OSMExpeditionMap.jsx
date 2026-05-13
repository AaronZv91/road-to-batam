import { useMemo } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, Marker } from "react-leaflet";
import { motion } from "framer-motion";

const ROUTE = [
  [1.2812, 103.6032], // Start offshore Tuas
  [1.2678, 103.5936],
  [1.2458, 103.5778],
  [1.2182, 103.5694],
  [1.1888, 103.5674], // South-west dip
  [1.1664, 103.5798],
  [1.1522, 103.6076],
  [1.1488, 103.6488],
  [1.1506, 103.6968],
  [1.1548, 103.7482],
  [1.1618, 103.7982],
  [1.1714, 103.8468],
  [1.1832, 103.8944],
  [1.1976, 103.9402],
  [1.2132, 103.9822],
  [1.2276, 104.0188],
  [1.2366, 104.0478], // North of Batam bend
  [1.2348, 104.0732],
  [1.2238, 104.0902],
  [1.2064, 104.1014], // Descend toward final coast
  [1.1846, 104.1062],
  [1.1592, 104.1072],
  [1.1326, 104.1064],
  [1.1082, 104.1048], // Batam north coast finish area
];

function smoothPath(points, samplesPerSegment = 8) {
  if (points.length < 4) return points;
  const out = [points[0]];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let j = 1; j <= samplesPerSegment; j += 1) {
      const t = j / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const lat =
        0.5 *
        ((2 * p1[0]) +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const lng =
        0.5 *
        ((2 * p1[1]) +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([lat, lng]);
    }
  }
  return out;
}

const SMOOTH_ROUTE = smoothPath(ROUTE, 10);
const MILESTONES = [
  { id: "M1", label: "First Splash", km: 100 },
  { id: "M2", label: "Cruise Interval", km: 250 },
  { id: "M3", label: "Swell Challenge", km: 450 },
  { id: "M4", label: "Final Sprint", km: 500 }
];

function haversineKm([lat1, lon1], [lat2, lon2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildProgressPolyline(coords, ratio) {
  if (ratio <= 0) return [coords[0]];
  if (ratio >= 1) return coords;

  const segments = [];
  let total = 0;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const len = haversineKm(coords[i], coords[i + 1]);
    segments.push(len);
    total += len;
  }

  const target = total * ratio;
  let walked = 0;
  const out = [coords[0]];

  for (let i = 0; i < segments.length; i += 1) {
    const nextWalked = walked + segments[i];
    if (nextWalked <= target) {
      out.push(coords[i + 1]);
      walked = nextWalked;
      continue;
    }
    const remain = target - walked;
    const t = Math.max(0, Math.min(1, remain / segments[i]));
    const [aLat, aLng] = coords[i];
    const [bLat, bLng] = coords[i + 1];
    out.push([aLat + (bLat - aLat) * t, aLng + (bLng - aLng) * t]);
    break;
  }

  return out;
}

function pointAtRatio(coords, ratio) {
  const partial = buildProgressPolyline(coords, ratio);
  return partial[partial.length - 1];
}

export default function OSMExpeditionMap({ progressKm, goalKm, stageLabel, boostSignal }) {
  const ratio = Math.max(0, Math.min(progressKm / goalKm, 1));
  const completed = useMemo(() => buildProgressPolyline(SMOOTH_ROUTE, ratio), [ratio]);
  const pod = completed[completed.length - 1];
  const milestonePoints = useMemo(
    () =>
      MILESTONES.map((milestone) => ({
        ...milestone,
        ratio: milestone.km / goalKm,
        point: pointAtRatio(SMOOTH_ROUTE, milestone.km / goalKm),
        reached: progressKm >= milestone.km
      })),
    [goalKm, progressKm]
  );
  const sharkIcon = useMemo(
    () =>
      L.divIcon({
        className: "shark-emoji-marker",
        html:
          '<div style="font-size:31px;line-height:31px;filter:drop-shadow(0 0 10px #22d3ee) drop-shadow(0 0 6px #a5f3fc) saturate(1.35) contrast(1.1);">🦈</div>',
        iconSize: [31, 31],
        iconAnchor: [16, 16],
      }),
    []
  );

  return (
    <motion.div
      className="game-card relative overflow-hidden rounded-2xl p-4"
      animate={boostSignal ? { x: [0, -4, 4, -3, 0] } : { x: 0 }}
      transition={{ duration: 0.45 }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="battle-subtitle text-sm font-semibold uppercase tracking-[0.2em]">Real Map Route (OSM)</h3>
        <div className="text-right">
          <p className="text-sm font-semibold text-emerald-700">
            {progressKm.toFixed(2)} / {goalKm} km
          </p>
          <p className="text-xs text-slate-300">{stageLabel}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border-2 border-cyan-300/50">
        <MapContainer
          center={[1.22, 103.9]}
          zoom={9}
          scrollWheelZoom={false}
          style={{ height: 320, width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Polyline
            positions={SMOOTH_ROUTE}
            pathOptions={{
              color: "#60a5fa",
              weight: 5,
              dashArray: "3 10",
              lineCap: "round",
              opacity: 0.6,
            }}
          />

          <Polyline
            positions={completed}
            pathOptions={{
              color: "#38bdf8",
              weight: 4,
              lineCap: "round",
              lineJoin: "round",
              dashArray: "3 10",
              opacity: 0.95
            }}
          />

          <CircleMarker center={ROUTE[0]} radius={7} pathOptions={{ color: "#facc15", fillColor: "#fde047", fillOpacity: 1 }}>
            <Tooltip direction="top">Singapore Start</Tooltip>
          </CircleMarker>
          <CircleMarker center={ROUTE[ROUTE.length - 1]} radius={7} pathOptions={{ color: "#22c55e", fillColor: "#22c55e", fillOpacity: 1 }}>
            <Tooltip direction="top">Batam Finish</Tooltip>
          </CircleMarker>

          <Marker position={pod} icon={sharkIcon} />

          {milestonePoints.map((milestone) => (
            <CircleMarker
              key={milestone.id}
              center={milestone.point}
              radius={6}
              pathOptions={{
                color: milestone.reached ? "#0369a1" : "#94a3b8",
                fillColor: milestone.reached ? "#38bdf8" : "#e2e8f0",
                fillOpacity: 1,
                weight: 2
              }}
            >
              <Tooltip direction="top">
                {milestone.id}: {milestone.label} ({milestone.km}km)
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {milestonePoints.map((milestone) => (
          <div
            key={`card-${milestone.id}`}
            className={`rounded-xl border-2 px-3 py-2 text-sm ${
              milestone.reached
                ? "border-neon/70 bg-neon/15 text-neon"
                : "border-cyan-300/30 bg-slate-900/70 text-slate-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold">{milestone.id}</p>
              <span className="text-base" aria-label={milestone.reached ? "completed" : "pending"}>
                {milestone.reached ? "✓" : "○"}
              </span>
            </div>
            <p className="text-xs">{milestone.label}</p>
            <p className="text-[11px] opacity-80">{milestone.km}km</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
