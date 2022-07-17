import React, { Component } from "react";
import {
  Overlay,
  ConfirmBox,
  Title,
  Message,
  ButtonGroup,
  ActionButton,
  TriggerText,
} from "./styles.js";

class ConfirmModal extends Component {
  state = { isOpen: false };

  hideModal = () => {
    this.setState({
      isOpen: false,
    });
  };

  showModal = () => {
    this.setState({
      isOpen: true,
    });
  };

  confirmAction = () => {
    this.props.onConfirm();
    this.hideModal();
  };
  render() {
    const { title, message, Component } = this.props;
    const { isOpen } = this.state;

    return isOpen ? (
      <Overlay>
        <ConfirmBox>
          <Title>{title}</Title>
          <Message>{message}</Message>
          <ButtonGroup>
            <ActionButton
              background="gray"
              border="1px solid darkgray"
              onClick={this.hideModal}
            >
              Cancel
            </ActionButton>
            <ActionButton onClick={this.confirmAction}>Ja</ActionButton>
          </ButtonGroup>
        </ConfirmBox>
      </Overlay>
    ) : Component ? (
      <Component onClick={this.showModal} />
    ) : (
      <TriggerText onClick={this.showModal}>{title}</TriggerText>
    );
  }
}

export default ConfirmModal;
