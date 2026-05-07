# Road to Batam

High-energy team expedition tracker for a corporate swimming club targeting a 500km mission to Batam.

## Stack

- React + Vite
- Tailwind CSS
- Framer Motion
- Lucide React
- LocalStorage-first data layer with backend-ready adapter

## Run

1. Install dependencies:
   - `npm install`
2. Start dev server:
   - `npm run dev`

## Storage Interface

The app uses `createStorage()` in `src/lib/storage.js` to keep data handling clean.
Swap `localStorageAdapter` with a Supabase adapter later without changing UI logic.
