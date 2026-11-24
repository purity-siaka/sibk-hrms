import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#1D3B84", dark: "#142A66" },
        blue: { DEFAULT: "#2F4DA8", soft: "#E3E9FB" },
        gold: { DEFAULT: "#F4B184", soft: "#FDEEE3", deep: "#7A3E12" },
        ink: "#16203F",
        muted: "#4B5877",
        line: "#E1E6F3",
        bg: "#F4F6FB",
        ok: { DEFAULT: "#1F6B45", soft: "#E1F3E9" },
        danger: { DEFAULT: "#8A2A1B", soft: "#FDE7E3" },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(22,32,63,.04), 0 4px 14px rgba(27,47,122,.06)",
        lift: "0 6px 22px rgba(27,47,122,.14)",
      },
    },
  },
  plugins: [],
};

export default config;
