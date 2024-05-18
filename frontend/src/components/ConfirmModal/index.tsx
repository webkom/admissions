import React, { JSXElementConstructor, useState } from "react";
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
  confirmText = "Ja",
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const hideModal = () => {
    setIsOpen(false);
  };

  const showModal = () => {
    setIsOpen(true);
  };

  const confirmAction = () => {
    onConfirm();
    hideModal();
  };

  return isOpen ? (
    <Overlay onClick={() => hideModal()}>
      <ConfirmBox onClick={(e) => e.stopPropagation()}>
        <Title>{title}</Title>
        <Message>{message}</Message>
        <ActionButtonsWrapper>
          <Button onClick={hideModal}>{cancelText}</Button>
          <Button dark onClick={confirmAction}>
            {confirmText}
          </Button>
        </ActionButtonsWrapper>
      </ConfirmBox>
    </Overlay>
  ) : (
    <TriggerComponent onClick={showModal} />
  );
};

export default ConfirmModal;
