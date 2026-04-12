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
      fontFamily: {
        sans: [
          "var(--font-poppins)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "\"Segoe UI\"",
          "sans-serif"
        ]
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
          "linear-gradient(180deg, rgba(244, 244, 244, 1), rgba(244, 244, 244, 1))"
      }
    }
  },
  plugins: []
};

export default config;
