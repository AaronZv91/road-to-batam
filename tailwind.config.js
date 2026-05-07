/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        midnight: "#020617",
        electric: "#38BDF8",
        neon: "#22C55E"
      },
      boxShadow: {
        glow: "0 0 24px rgba(56, 189, 248, 0.55)",
        green: "0 0 24px rgba(34, 197, 94, 0.45)"
      }
    }
  },
  plugins: []
};
