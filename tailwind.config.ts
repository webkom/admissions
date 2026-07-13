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
  panel: "var(--color-brand-subtle)",
};

const config: Config = {
  content: ["./frontend/**/*.{ts,tsx,js,jsx,html}"],
  theme: {
    extend: {
      colors: {
        white: "var(--color-absolute-white)",
        black: "var(--color-black)",
        brand,
        success: {
          DEFAULT: "var(--color-success)",
          bg: "var(--color-success-bg)",
          border: "var(--color-success-border)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          bg: "var(--color-danger-bg)",
          border: "var(--color-danger-border)",
        },
        overlay: "var(--color-overlay)",
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
          white: "var(--color-absolute-white)",
          gray3: "var(--color-gray-3)",
          gray7: "var(--color-gray-7)",
        },
      },
      borderRadius: {
        sm: "var(--border-radius-sm)",
        DEFAULT: "var(--border-radius-sm)",
        md: "var(--border-radius-md)",
        lg: "var(--border-radius-md)",
        xl: "var(--border-radius-lg)",
        "2xl": "var(--border-radius-lg)",
        panel: "var(--border-radius-lg)",
      },
      maxWidth: {
        lego: "var(--lego-max-width)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-md)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        modal: "var(--shadow-modal)",
        panel: "var(--shadow-panel)",
        "panel-hover": "var(--shadow-panel-hover)",
        action: "var(--shadow-action)",
        toggle: "var(--shadow-toggle)",
        "drawer-left": "var(--shadow-drawer-left)",
        "tint-sm": "var(--shadow-tint-sm)",
      },
      ringWidth: {
        3: "3px",
      },
      fontSize: {
        nano: ["var(--font-size-nano)", { lineHeight: "0.875rem" }],
        tiny: ["var(--font-size-tiny)", { lineHeight: "1rem" }],
        label: ["var(--font-size-label)", { lineHeight: "1rem" }],
        detail: ["var(--font-size-detail)", { lineHeight: "1.15rem" }],
        ui: ["var(--font-size-ui)", { lineHeight: "1.25rem" }],
        title: ["var(--font-size-title)", { lineHeight: "1.4rem" }],
        action: ["var(--font-size-md)", { lineHeight: "1.5rem" }],
        "body-lg": ["var(--font-size-lg)", { lineHeight: "1.7rem" }],
        countdown: ["2rem", { lineHeight: "2.25rem" }],
        "display-sm": ["var(--font-size-xl)", { lineHeight: "2.25rem" }],
        "display-md": ["var(--font-size-display-md)", { lineHeight: "2.5rem" }],
        "display-lg": [
          "var(--font-size-display-lg)",
          { lineHeight: "3.25rem" },
        ],
      },
      letterSpacing: {
        badge: "0.06em",
        "badge-wide": "0.12em",
        caps: "0.05em",
        label: "0.08em",
        display: "-0.03em",
        "display-tight": "-0.045em",
      },
      screens: {
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
            boxShadow: "0 0 0 0 var(--color-brand-pulse-start)",
          },
          "70%": {
            boxShadow: "0 0 0 14px var(--color-brand-pulse-end)",
          },
          "100%": {
            boxShadow: "0 0 0 0 var(--color-brand-pulse-end)",
          },
        },
        "overlay-fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in var(--easing-medium)",
        "overlay-fade-in": "overlay-fade-in var(--easing-fast)",
        "slide-in-right": "slide-in-right var(--easing-medium)",
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
