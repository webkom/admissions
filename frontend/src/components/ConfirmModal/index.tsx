import React, { useState } from "react";
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

  const showModal = () => setIsOpen(true);
  const hideModal = () => setIsOpen(false);

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
          <StyledButton onClick={hideModal}>{cancelText}</StyledButton>
          <StyledButton dark onClick={confirmAction}>
            {confirmText}
          </StyledButton>
        </ActionButtonsWrapper>
      </ConfirmBox>
    </Overlay>
  ) : (
    <TriggerComponent onClick={showModal} />
  );
};

export default ConfirmModal;
