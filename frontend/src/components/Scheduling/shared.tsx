import { css } from "styled-components";

export const scheduleSurface = css`
  background: #fffdf9;
  border: 1px solid #e7dece;
  border-radius: 1rem;
  box-shadow: 0 10px 24px -22px rgba(43, 31, 20, 0.24);
`;

export const scheduleInset = css`
  background: #f7f2ea;
  border: 1px solid #e7dece;
  border-radius: 0.85rem;
  box-shadow: none;
`;

export const scheduleLabel = css`
  font-family: "OCR A Extended", var(--font-family);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7a6a5a;
`;

export const primaryAction = css`
  background: #111827;
  color: #ffffff;
  border: none;
  box-shadow: none;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    background: #1f2937;
    box-shadow: none;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    box-shadow: none;
  }
`;

export const secondaryAction = css`
  background: #ffffff;
  color: #3f3a34;
  border: 1px solid #ddd2c3;
  box-shadow: none;

  &:hover:not(:disabled) {
    background: #ffffff;
    border-color: #ccbca5;
    color: #111827;
    transform: translateY(-1px);
  }
`;
