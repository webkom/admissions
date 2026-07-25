import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Overlay,
  ConfirmBox,
  Title,
  Message,
  ActionButtonsWrapper,
} from "./styles";
import { StyledButton } from "src/components/LinkButton";

interface TriggerComponentProps {
  onClick: () => void;
}

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  trigger: React.FC<TriggerComponentProps>;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title,
  message,
  confirmText = "Bekreft",
  cancelText = "Avbryt",
  onConfirm,
  trigger: TriggerComponent,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const showModal = () => setIsOpen(true);
  const hideModal = useCallback(() => {
    setIsOpen(false);
    window.setTimeout(() => {
      triggerRef.current
        ?.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
    }, 0);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const getFocusableElements = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    const focusableElements = getFocusableElements();
    (focusableElements[0] ?? dialog).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        hideModal();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }

      const elements = getFocusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [hideModal, isOpen]);

  const confirmAction = () => {
    onConfirm();
    hideModal();
  };

  return (
    <>
      <span ref={triggerRef} style={{ display: "contents" }}>
        <TriggerComponent onClick={showModal} />
      </span>
      {isOpen && (
        <Overlay onClick={hideModal}>
          <ConfirmBox
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <Title id={titleId}>{title}</Title>
            <Message id={messageId}>{message}</Message>
            <ActionButtonsWrapper>
              <StyledButton onClick={hideModal}>{cancelText}</StyledButton>
              <StyledButton dark onClick={confirmAction}>
                {confirmText}
              </StyledButton>
            </ActionButtonsWrapper>
          </ConfirmBox>
        </Overlay>
      )}
    </>
  );
};

export default ConfirmModal;
