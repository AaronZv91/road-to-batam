const STORAGE_KEY = "road-to-batam:v1";

const CORE_SWIMMERS = [
  "Aaron",
  "Mei",
  "Kai",
  "Jia",
  "Hafiz",
  "Nina",
  "Sasha",
  "Imran",
  "Lina",
  "Dev",
  "Farah",
  "Zed"
];

const now = Date.now();
const hour = 1000 * 60 * 60;

const seedState = {
  team: CORE_SWIMMERS.map((name, idx) => ({
    id: `core-${idx + 1}`,
    name,
    totalKm: Number((6 + Math.random() * 18).toFixed(2)),
    lastLoggedAt: now - Math.floor(Math.random() * 72) * hour
  })),
  logs: []
};

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const localStorageAdapter = {
  load() {
    const fromStore = safeParse(localStorage.getItem(STORAGE_KEY));
    if (fromStore?.team?.length) {
      return fromStore;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedState));
    return seedState;
  },
  save(next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
};

export function createStorage(adapter = localStorageAdapter) {
  return {
    loadState: () => adapter.load(),
    saveState: (next) => adapter.save(next)
  };
}

// Replace this with an API call (Supabase/Sheets) when backend is ready.
export async function syncStateSnapshot(state) {
  return Promise.resolve({
    ok: true,
    syncedAt: new Date().toISOString(),
    payloadSize: JSON.stringify(state).length
  });
}
