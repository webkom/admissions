import type { Config } from "tailwindcss";
import { breakpoints } from "./frontend/src/styles/designTokens";

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
        readable: "var(--content-width-readable)",
      },
      minWidth: {
        "application-table": "var(--application-table-min-width)",
        "schedule-table": "var(--schedule-table-min-width)",
      },
      width: {
        "schedule-label": "var(--schedule-label-width)",
        "schedule-name": "var(--schedule-name-width)",
      },
      gridTemplateColumns: {
        "auto-card-sm":
          "repeat(auto-fit, minmax(var(--layout-card-min-sm), 1fr))",
        "auto-card-md":
          "repeat(auto-fit, minmax(var(--layout-card-min-md), 1fr))",
        "auto-card-lg":
          "repeat(auto-fit, minmax(var(--layout-card-min-lg), 1fr))",
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
        3: "var(--focus-ring-width)",
      },
      zIndex: {
        modal: "var(--modal-layer)",
      },
      fontSize: {
        nano: [
          "var(--font-size-nano)",
          { lineHeight: "var(--line-height-nano)" },
        ],
        tiny: [
          "var(--font-size-tiny)",
          { lineHeight: "var(--line-height-tiny)" },
        ],
        label: [
          "var(--font-size-label)",
          { lineHeight: "var(--line-height-tiny)" },
        ],
        detail: [
          "var(--font-size-detail)",
          { lineHeight: "var(--line-height-detail)" },
        ],
        ui: ["var(--font-size-ui)", { lineHeight: "var(--line-height-ui)" }],
        title: [
          "var(--font-size-title)",
          { lineHeight: "var(--line-height-title)" },
        ],
        action: [
          "var(--font-size-md)",
          { lineHeight: "var(--line-height-action)" },
        ],
        "body-lg": [
          "var(--font-size-lg)",
          { lineHeight: "var(--line-height-body-lg)" },
        ],
        countdown: [
          "var(--font-size-countdown)",
          { lineHeight: "var(--line-height-countdown)" },
        ],
        "display-sm": [
          "var(--font-size-xl)",
          { lineHeight: "var(--line-height-countdown)" },
        ],
        "display-md": [
          "var(--font-size-display-md)",
          { lineHeight: "var(--line-height-display-md)" },
        ],
        "display-lg": [
          "var(--font-size-display-lg)",
          { lineHeight: "var(--line-height-display-lg)" },
        ],
      },
      letterSpacing: {
        badge: "var(--letter-spacing-badge)",
        "badge-wide": "var(--letter-spacing-badge-wide)",
        caps: "var(--letter-spacing-caps)",
        label: "var(--letter-spacing-label)",
        display: "var(--letter-spacing-display)",
        "display-tight": "var(--letter-spacing-display-tight)",
      },
      screens: {
        portrait: { raw: `(max-width: ${breakpoints.portrait})` },
        handheld: { raw: `(max-width: ${breakpoints.handheld})` },
      },
      keyframes: {
        "fade-in": {
          from: {
            opacity: "0",
            transform: "translateY(var(--motion-distance-sm))",
          },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "timeline-pulse": {
          "0%": {
            boxShadow: "0 0 0 0 var(--color-brand-pulse-start)",
          },
          "70%": {
            boxShadow:
              "0 0 0 var(--motion-pulse-radius) var(--color-brand-pulse-end)",
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
