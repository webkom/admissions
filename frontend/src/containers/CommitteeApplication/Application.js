import React, { Component } from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import {
  FieldLabel,
  InputValidationFeedback,
  StyledTextAreaField
} from "src/components/styledFields";
import readmeIfy from "src/components/ReadmeLogo";

class Application extends Component {
  componentDidMount() {
    this.setState({
      timeout: setInterval(() => {
        sessionStorage.setItem(
          "applicationText",
          JSON.stringify({
            ...JSON.parse(sessionStorage.getItem("applicationText")),
            [this.props.committee.toLowerCase()]: this.props.field.value
          })
        );
      }, 4000)
    });
  }
  componentWillUnmount() {
    clearInterval(this.state.timeout);
  }
  render() {
    const {
      responseLabel,
      committee,
      field: { name, onChange, value },
      form: { touched, errors, handleBlur }
    } = this.props;
    const error = touched[name] && errors[name];
    return (
      <Container>
        <Name>{readmeIfy(committee)}</Name>
        <Logo src={require(`assets/committee_logos/${name}.png`)} />
        {responseLabel && <ResponseLabel>{responseLabel}</ResponseLabel>}
        <InputWrapper>
          <FieldLabel htmlFor={name.toLowerCase()}>Søknadstekst</FieldLabel>
          <InputArea
            className="textarea"
            type="textarea"
            name={name}
            id={name}
            onChange={onChange}
            onBlur={handleBlur}
            placeholder="Skriv søknadstekst her..."
            value={value}
            error={error}
            rows="10"
          />
          <InputValidationFeedback error={error} />
        </InputWrapper>
      </Container>
    );
  }
}

export default Application;

/** Styles **/

const Container = styled.div`
  display: grid;
  grid-template-columns: 4rem 1fr;
  grid-template-areas:
    "logo name"
    "responselabel responselabel"
    "input input";
  grid-gap: 0.7rem;
  align-items: center;
  margin: 2rem 0rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--lego-gray-medium);

  &:last-of-type {
    border-bottom: 0;
    padding-bottom: 0;
  }

  ${media.handheld`
    grid-template-columns: auto;
    grid-template-rows: repeat(3, auto);
    grid-template-areas:
      "logoname"
      "response"
      "input";
    margin: 1em 0;
    `};
`;

export const Name = styled.h3`
  grid-area: name;
  margin: 0;
  font-size: 1.5rem;
  line-height: 2rem;
  letter-spacing: 0.7px;

  ${media.handheld`
    font-size: 1.3rem;
    padding: 0
    text-align: left;
    align-self: center;
    `};
`;

export const Logo = styled.img`
  grid-area: logo;
  justify-self: start;
  object-fit: scale-down;
  max-width: 60px;
`;

export const ResponseLabel = styled.div`
  grid-area: responselabel;
  background: linear-gradient(
    180deg,
    rgba(234, 233, 232, 0.76) 0%,
    rgba(218, 218, 218, 0.56) 100%
  );
  background-repeat: repeat;
  border: 1px solid rgba(53, 138, 204, 0.22);
  border-radius: 13px;
  padding: 1rem;
  font-size: 0.8rem;
  line-height: 1rem;
  color: rgba(57, 75, 89, 0.8);
`;

export const InputWrapper = styled.div`
  grid-area: input;
  font-family: var(--font-family);
  font-size: 1rem;
`;

const InputArea = styled(StyledTextAreaField)`
  min-height: 10rem;
`;
