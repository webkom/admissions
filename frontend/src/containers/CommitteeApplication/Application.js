import React, { Component } from "react";
import Textarea from "react-textarea-autosize";

import InputValidationFeedback from "src/components/InputValidationFeedback";
import { Card, CardParagraph, CardTitle } from "src/components/Card";

import {
  WriteApplicationWrapper,
  ResponseLabelWrapper,
  LogoNameWrapper,
  Logo,
  Name
} from "./styles";
import Wrapper from "./Wrapper";

import "./Application.css";

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
      <Card className="response" margin="2rem 0rem">
        <Wrapper>
          <LogoNameWrapper>
            <Name htmlFor={name.toLowerCase()}>{committee}</Name>
            <Logo src={require(`assets/committee_logos/${name}.png`)} />
          </LogoNameWrapper>

          <ResponseLabelWrapper>
            <CardTitle margin="0.5rem" fontSize="0.8em">
              Dette ønsker komiteen at du inkluderer
            </CardTitle>
            <CardParagraph margin="0.5rem">{responseLabel}</CardParagraph>
          </ResponseLabelWrapper>

          <WriteApplicationWrapper>
            <CardTitle margin="0.5rem" fontSize="0.8em">
              Skriv søknaden din her <InputValidationFeedback error={error} />
            </CardTitle>
            <Textarea
              className="textarea"
              type="textarea"
              name={name}
              id={name}
              onChange={onChange}
              onBlur={handleBlur}
              placeholder="Skriv søknadstekst her..."
              value={value}
              rows="10"
            />
          </WriteApplicationWrapper>
        </Wrapper>
      </Card>
    );
  }
}

export default Application;
