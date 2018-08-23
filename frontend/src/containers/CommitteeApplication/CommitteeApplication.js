import React, { Component } from "react";

import "./CommitteeApplication.css";
import Textarea from "react-textarea-autosize";

import Wrapper from "./Wrapper";
import InputFeedback from "./InputFeedback";
import CommitteeName from "./CommitteeName";
import CommitteeLogo from "./CommitteeLogo";
import { Card, CardParagraph, CardTitle } from "src/components/Card";

class CommitteeApplication extends Component {
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
      <Wrapper>
        <CommitteeLogo logo={require(`assets/committee_logos/${name}.png`)} />
        <CommitteeName name={committee} />

        <Card className="response" margin="0.5rem 1rem">
          <CardTitle margin="0.5rem" fontSize="0.8em">
            Dette ønsker komiteen at du inkluderer
          </CardTitle>
          <CardParagraph margin="0.5rem">{responseLabel}</CardParagraph>
        </Card>

        <Card className="input" margin="0.5rem 1rem">
          <CardTitle margin="0.5rem" fontSize="0.8em">
            Skriv søknaden din her <InputFeedback error={error} />
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
        </Card>
      </Wrapper>
    );
  }
}

export { CommitteeApplication };
