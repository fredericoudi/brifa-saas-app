import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: "hsl(var(--bg))",
        panel: "hsl(var(--panel))",
        panelAlt: "hsl(var(--panel-alt))",
        border: "hsl(var(--border))",
        text: "hsl(var(--text))",
        muted: "hsl(var(--muted))",
        brand: "hsl(var(--brand))",
        brandMuted: "hsl(var(--brand-muted))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))"
      },
      boxShadow: {
        panel: "0 24px 70px -46px rgba(26, 38, 73, 0.3)",
        soft: "0 12px 34px -26px rgba(26, 38, 73, 0.24)"
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem"
      },
      backgroundImage: {
        "dashboard-pattern":
          "linear-gradient(180deg, rgba(249, 251, 255, 0.96), rgba(243, 246, 252, 0.96))"
      }
    }
  },
  plugins: []
};

export default config;
