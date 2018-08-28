import React, { Component } from "react";
import {
  Overlay,
  ConfirmBox,
  Title,
  Message,
  ButtonGroup,
  ActionButton,
  TriggerText
} from "./styles.js";

type Props = {
  onConfirm: () => Promise<*>,
  title: string,
  message: string
}

type State = {
  isOpen: boolean
}

class ConfirmModal extends Component<Props, State> {
  state = { isOpen: false }

  hideModal = () => {
    this.setState({
      isOpen: false
    })
  }

  showModal = () => {
    this.setState({
      isOpen: true
    })
  }
  render() {
    const { onConfirm, title, message } = this.props;
    const { isOpen } = this.state;

    return isOpen ? (
      <Overlay>
        <ConfirmBox>
          <Title>{title}</Title>
          <Message>{message}</Message>
          <ButtonGroup>
            <ActionButton background="gray" border="1px solid darkgray" onClick={this.hideModal}>Cancel</ActionButton>
            <ActionButton onClick={onConfirm}>Ja</ActionButton>
          </ButtonGroup>
        </ConfirmBox>
      </Overlay>
    ) : <TriggerText onClick={this.showModal}>{title}</TriggerText>
  }
}

export default ConfirmModal
