import React, { Component } from "react";
import { FieldLabel, StyledTextAreaField } from "src/components/styledFields";
import styled from "styled-components";

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
      label,
      optional = false,
      field: { name, onChange, value },
      form: { handleBlur }
    } = this.props;
    return (
      <div>
        <FieldLabel>{label}</FieldLabel>
        {optional && <Optional>(valgfritt)</Optional>}
        <StyledTextAreaField
          type="textarea"
          name={name}
          id={name}
          onChange={onChange}
          onBlur={handleBlur}
          placeholder="Skriv dine kommentarer her..."
          value={value}
          rows="5"
        />
      </div>
    );
  }
}

export default PriorityTextField;

/** Styles **/

const Optional = styled.span`
  font-size: 0.8rem;
  color: rgba(57, 75, 89, 0.75);
  font-weight: 500;
  margin-left: 0.3rem;
  line-height: 1rem;
`;
