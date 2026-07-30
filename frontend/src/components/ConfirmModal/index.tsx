import React, {
  JSXElementConstructor,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  Overlay,
  ConfirmBox,
  Title,
  Message,
  ActionButtonsWrapper,
} from "./styles";
import { Button } from "@webkom/lego-bricks";

interface TriggerComponentProps {
  onClick: () => void;
}

interface ConfirmModalProps {
  onConfirm: () => void;
  title: string;
  message: string;
  trigger: JSXElementConstructor<TriggerComponentProps>;
  cancelText?: string;
  confirmText?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  onConfirm,
  title,
  message,
  trigger: TriggerComponent,
  cancelText = "Avbryt",
  confirmText = "Bekreft",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

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

  const showModal = () => {
    setIsOpen(true);
  };

  const confirmAction = () => {
    onConfirm();
    hideModal();
  };

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const getFocusableElements = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    (getFocusableElements()[0] ?? dialog).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        hideModal();
        return;
      }
      if (event.key !== "Tab") return;

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
              <Button onClick={hideModal}>{cancelText}</Button>
              <Button dark onClick={confirmAction}>
                {confirmText}
              </Button>
            </ActionButtonsWrapper>
          </ConfirmBox>
        </Overlay>
      )}
    </>
  );
};

export default ConfirmModal;
