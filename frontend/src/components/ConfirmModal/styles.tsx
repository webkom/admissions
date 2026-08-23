import "@webkom/lego-bricks/dist/style.css";
import styled from "styled-components";

export const Overlay = styled.div`
  min-width: 100%;
  min-height: 100%;
  background: var(--color-overlay);
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: var(--modal-layer);
`;

export const ConfirmBox = styled.div`
  position: fixed;
  width: min(
    calc(100% - (2 * var(--spacing-xl))),
    var(--content-width-compact)
  );
  top: var(--content-sticky-offset);
  left: 0;
  right: 0;
  margin: 0 auto;
  background: var(--color-surface-base);
  border-radius: var(--border-radius-sm);
  padding: var(--spacing-2xl);
`;

export const Title = styled.h2`
  margin: 0;
  color: var(--lego-font-color);
`;

export const Message = styled.div`
  color: var(--lego-font-color);
`;

export const ActionButtonsWrapper = styled.div`
  display: flex;
  flex-direction: row;
  width: 100%;
  justify-content: space-between;
  margin-top: var(--spacing-lg);
  padding: 0;
`;
