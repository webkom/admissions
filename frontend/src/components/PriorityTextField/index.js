import React, { Component } from "react";
import Textarea from "react-textarea-autosize";

import "./style.css";

class PriorityTextField extends Component {
  componentDidMount() {
    this.setState({
      timeout: setInterval(() => {
        sessionStorage.setItem("text", this.props.field.value);
      }, 4000)
    });
  }
  componentWillUnmount() {
    clearInterval(this.state.timeout);
  }
  render() {
    const {
      field: { name, onChange, value },
      form: { handleBlur }
    } = this.props;
    return (
      <Textarea
        className="textarea"
        type="textarea"
        name={name}
        id={name}
        onChange={onChange}
        onBlur={handleBlur}
        placeholder="Skriv dine kommentarer her..."
        value={value}
        rows="10"
      />
    );
  }
}

export default PriorityTextField;
