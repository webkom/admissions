import { css } from "styled-components";

export const scheduleSurface = css`
  background: #ffffff;
  border: 1px solid #e4e4e4;
  border-radius: 10px;
`;

export const scheduleInset = css`
  background: #f5f5f5;
  border: 1px solid #e4e4e4;
  border-radius: 8px;
`;

export const scheduleLabel = css`
  font-family: var(--font-family);
  font-size: 0.688rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: #a0a0a0;
`;

export const scheduleInput = css`
  padding: 0.45rem 0.65rem;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
  background: #ffffff;
  color: #111111;
  font-size: 0.875rem;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &:focus {
    outline: none;
    border-color: rgba(178, 18, 7, 0.4);
    box-shadow: 0 0 0 3px rgba(178, 18, 7, 0.06);
  }
`;

export const scheduleGridShell = css`
  ${scheduleInset};
  overflow-x: auto;
  padding: 0.75rem;
`;

export const scheduleGridHeaderCell = css`
  ${scheduleLabel};
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 2.2rem;
  border-radius: 6px;
  background: #ffffff;
  border: 1px solid #e4e4e4;
  color: #6b6b6b;
`;

export const scheduleGridTimeLabel = css`
  ${scheduleLabel};
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 0.5rem;
  color: #c4c4c4;
`;

export const scheduleBadge = css`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.28rem 0.6rem;
  border-radius: 999px;
  background: #f5f5f5;
  border: 1px solid #e4e4e4;
  color: #6b6b6b;
  font-size: 0.75rem;
  font-weight: 600;
`;

export const primaryAction = css`
  background: var(--lego-red-color);
  color: #ffffff;
  border: 1px solid var(--lego-red-color);
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover:not(:disabled) {
    background: #9a1006;
    border-color: #9a1006;
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(178, 18, 7, 0.15);
  }

  &:active:not(:disabled) {
    background: #850e05;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

export const secondaryAction = css`
  background: #ffffff;
  color: var(--lego-red-color);
  border: 1px solid #e4e4e4;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;

  &:hover:not(:disabled) {
    border-color: rgba(178, 18, 7, 0.28);
    background: rgba(178, 18, 7, 0.03);
    color: #8e0e06;
  }
`;
