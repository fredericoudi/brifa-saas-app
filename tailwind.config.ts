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
        panel: "0 24px 60px -36px rgba(15, 23, 42, 0.24)",
        soft: "0 12px 30px -24px rgba(15, 23, 42, 0.22)"
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem"
      },
      backgroundImage: {
        "dashboard-pattern":
          "radial-gradient(circle at 100% 0, hsl(var(--brand-muted)) 0%, transparent 32%), radial-gradient(circle at 0 100%, hsl(var(--brand-muted)) 0%, transparent 38%), linear-gradient(180deg, rgba(255, 255, 255, 0.7), rgba(248, 250, 255, 0.95))"
      }
    }
  },
  plugins: []
};

export default config;
