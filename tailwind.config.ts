import type { Config } from "tailwindcss";

const brand = {
  DEFAULT: "var(--color-brand)",
  hover: "var(--color-brand-hover)",
  dark: "var(--color-brand-dark)",
  pressed: "var(--color-brand-pressed)",
  input: "var(--color-brand-input)",
  ring: "var(--color-brand-ring)",
  ringSoft: "var(--color-brand-ring-soft)",
  soft: "var(--color-brand-soft)",
  subtle: "var(--color-brand-subtle)",
  muted: "var(--color-brand-muted)",
  tint: "var(--color-brand-tint)",
  badge: "var(--color-brand-badge)",
  fill: "var(--color-brand-fill)",
  border: "var(--color-brand-border)",
  strongBorder: "var(--color-brand-strong-border)",
  panelBorder: "var(--color-brand-panel-border)",
  activeBorder: "var(--color-brand-active-border)",
  focus: "var(--color-brand-focus)",
  // The `panel` variant is used as a filled tile background for selected
  // states. Approximated as the soft brand tint.
  panel: "var(--color-brand-subtle)",
};

const config: Config = {
  content: ["./frontend/**/*.{ts,tsx,js,jsx,html}"],
  theme: {
    extend: {
      colors: {
        brand,
        success: {
          DEFAULT: "var(--color-success)",
          bg: "var(--color-success-bg)",
          border: "var(--color-success-border)",
        },
        surface: {
          base: "var(--color-surface-base)",
          page: "var(--color-surface-page)",
          soft: "var(--color-surface-soft)",
          subtle: "var(--color-surface-subtle)",
          muted: "var(--color-surface-muted)",
          hover: "var(--color-surface-hover)",
          neutral: "var(--color-surface-neutral)",
          disabled: "var(--color-surface-disabled)",
        },
        border: {
          DEFAULT: "var(--color-border-default)",
          soft: "var(--color-border-soft)",
          muted: "var(--color-border-muted)",
          quiet: "var(--color-border-quiet)",
          faint: "var(--color-border-faint)",
        },
        text: {
          primary: "var(--color-text-primary)",
          strong: "var(--color-text-strong)",
          accent: "var(--color-text-accent)",
          body: "var(--color-text-body)",
          soft: "var(--color-text-soft)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
          subtle: "var(--color-text-subtle)",
          faded: "var(--color-text-faded)",
          disabled: "var(--color-text-disabled)",
          white: "#ffffff",
          gray3: "var(--color-gray-3)",
          gray7: "var(--color-gray-7)",
        },
      },
      borderRadius: {
        panel: "var(--border-radius-lg)",
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        "panel-hover": "var(--shadow-panel-hover)",
        action: "var(--shadow-action)",
        toggle: "var(--shadow-toggle)",
      },
      ringWidth: {
        3: "3px",
      },
      fontSize: {
        tiny: ["0.65rem", { lineHeight: "1rem" }],
        label: ["0.7rem", { lineHeight: "1rem" }],
        detail: ["0.8rem", { lineHeight: "1.15rem" }],
        ui: ["0.875rem", { lineHeight: "1.25rem" }],
        title: ["1rem", { lineHeight: "1.4rem" }],
        action: ["1rem", { lineHeight: "1.5rem" }],
        "body-lg": ["1.125rem", { lineHeight: "1.7rem" }],
        countdown: ["2rem", { lineHeight: "2.25rem" }],
        "display-sm": ["1.875rem", { lineHeight: "2.25rem" }],
        "display-md": ["2.25rem", { lineHeight: "2.5rem" }],
        "display-lg": ["3rem", { lineHeight: "3.25rem" }],
      },
      letterSpacing: {
        badge: "0.06em",
        "badge-wide": "0.12em",
        caps: "0.05em",
        label: "0.08em",
      },
      screens: {
        // Orientation/size-based variants used across the scheduler UI.
        // Both are applied as max-width media queries (smaller screens).
        portrait: { raw: "(max-width: 900px)" },
        handheld: { raw: "(max-width: 640px)" },
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "timeline-pulse": {
          "0%": {
            boxShadow: "0 0 0 0 rgb(178 28 23 / 55%)",
          },
          "70%": {
            boxShadow: "0 0 0 14px rgb(178 28 23 / 0%)",
          },
          "100%": {
            boxShadow: "0 0 0 0 rgb(178 28 23 / 0%)",
          },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
        "pulse-brand": "timeline-pulse 2s ease-in-out infinite",
      },
      backgroundImage: {
        "toggle-active": "var(--gradient-toggle-active)",
      },
    },
  },
  plugins: [],
};

export default config;
