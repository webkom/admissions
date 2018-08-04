import React from "react";

import "./CommitteeApplication.css";
import Textarea from "react-textarea-autosize";

import Wrapper from "./Wrapper";
import InputFeedback from "./InputFeedback";
import CommitteeName from "./CommitteeName";
import CommitteeLogo from "./CommitteeLogo";
import { Card, CardParagraph, CardTitle } from "src/components/Card";

const CommitteeApplication = ({
  responseLabel,
  committee,
  field: { name, onChange, value },
  form: { touched, errors, handleBlur, setFieldValue }
}) => {
  const handleApplicationFieldBlur = e => {
    handleBlur(e);

    var oldApplicationText = JSON.parse(
      sessionStorage.getItem("applicationText")
    );

    if (oldApplicationText != null) {
      var applicationText = {
        ...oldApplicationText,
        [committee.toLowerCase()]: value
      };
      var applicationTextJSON = JSON.stringify(applicationText);

      sessionStorage.setItem("applicationText", applicationTextJSON);
    } else {
      var applicationText = { [committee.toLowerCase()]: value };
      var applicationTextJSON = JSON.stringify(applicationText);
      sessionStorage.setItem("applicationText", applicationTextJSON);
    }
  };

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
          onBlur={handleApplicationFieldBlur}
          placeholder="Skriv søknadstekst her..."
          value={value}
          rows="10"
        />
      </Card>
    </Wrapper>
  );
};

export { CommitteeApplication };
