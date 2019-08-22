import React, { Component } from "react";
import styled from "styled-components";
import Raven from "raven-js";
import { withFormik, Field, Form } from "formik";
import * as Yup from "yup";
import djangoData from "src/utils/djangoData";
import callApi from "src/utils/callApi";

import UserApplication from "src/containers/UserApplication";
import PageTitle from "src/components/PageTitle";
import TextAreaField from "src/components/TextAreaField";

import CSRFToken from "./csrftoken";

import {
  EditCommitteeFormWrapper,
  FormWrapper,
  SubmitButton,
  Wrapper,
  LinkLink,
  CSVExport,
  Statistics,
  StatisticsName,
  StatisticsWrapper,
  CommitteeLogo,
  CommitteeLogoWrapper
} from "./styles";

class AdminPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      results: undefined,
      error: null,
      user: { name: "" },
      applications: [],
      csvData: [],
      headers: [
        { label: "Full Name", key: "name" },
        { label: "Søknadstekst", key: "applicationText" },
        { label: "Mobilnummer", key: "phoneNumber" },
        { label: "Email", key: "email" },
        { label: "Username", key: "username" },
        { label: "Tid sendt", key: "timeSent" }
      ],
      committeeNames: {
        webkom: "Webkom",
        arrkom: "Arrkom",
        bedkom: "Bedkom",
        pr: "PR",
        readme: "readme",
        labamba: "LaBamba",
        fagkom: "Fagkom",
        koskom: "Koskom"
      }
    };
  }

  generateCSVData = (
    name,
    email,
    username,
    timeSent,
    applicationText,
    phoneNumber
  ) => {
    this.setState(prevState => ({
      ...prevState,
      csvData: [
        ...prevState.csvData,
        {
          name: name,
          email: email,
          username: username,
          applicationText: applicationText,
          timeSent: timeSent,
          phoneNumber: phoneNumber
        }
      ]
    }));
  };

  componentDidMount() {
    callApi("/application/").then(
      ({ jsonData }) => {
        this.setState({
          applications: jsonData
        });
      },
      error => {
        this.setState({ error });
      }
    );

    this.setState({
      user: { name: djangoData.user && djangoData.user.full_name }
    });
    Raven.setUserContext(djangoData.user);
  }

  render() {
    const { error, applications, csvData, headers } = this.state;

    applications.sort(function(a, b) {
      if (a.user.full_name < b.user.full_name) return -1;
      if (a.user.full_name > b.user.full_name) return 1;
      return 0;
    });
    const filteredApplications = applications.filter(userApplication => {
      var filteredComApp = userApplication.committee_applications.filter(
        committeeApplication =>
          committeeApplication.committee.name.toLowerCase() ==
          djangoData.user.leader_of_committee.toLowerCase()
      );

      return filteredComApp.length > 0;
    });

    // Render applications from users
    const UserApplications = filteredApplications.map((userApplication, i) => {
      return (
        <UserApplication
          key={i}
          {...userApplication}
          whichCommitteeLeader={djangoData.user.leader_of_committee}
          generateCSVData={this.generateCSVData}
        />
      );
    });
    const committee = this.props.committees.find(
      committee =>
        committee.name.toLowerCase() ===
        djangoData.user.leader_of_committee.toLowerCase()
    );

    const committeeId = committee && committee.pk;

    const numApplicants = filteredApplications.length;

    if (error) {
      return <div>Error: {error.message}</div>;
    } else {
      return (
        <PageWrapper>
          <PageTitle>Admin Panel</PageTitle>
          <CommitteeLogoWrapper>
            <CommitteeLogo
              src={require(`assets/committee_logos/${djangoData.user.leader_of_committee.toLowerCase()}.png`)}
            />
            <h2>{djangoData.user.leader_of_committee}</h2>
          </CommitteeLogoWrapper>
          <LinkLink to="/">Gå til forside</LinkLink>

          <Wrapper>
            <EditCommitteeForm
              apiRoot={this.API_ROOT}
              committee={djangoData.user.leader_of_committee}
              initialDescription={committee && committee.description}
              initialReplyText={committee && committee.response_label}
              committeeId={committeeId}
            />
          </Wrapper>
          <Wrapper>
            <Statistics>
              <StatisticsWrapper>
                <StatisticsName>Antall søkere</StatisticsName>
                {numApplicants} {numApplicants == 1 ? "søker" : "søkere"}
              </StatisticsWrapper>
            </Statistics>
            <CSVExport
              data={csvData}
              headers={headers}
              filename={"applications.csv"}
              target="_blank"
            >
              Eksporter som csv
            </CSVExport>
            {UserApplications}
          </Wrapper>
        </PageWrapper>
      );
    }
  }
}

export default AdminPage;

const MyInnerForm = props => {
  const { isSubmitting, handleSubmit, isValid } = props;
  return (
    <Form>
      <FormWrapper>
        <CSRFToken />
        <EditCommitteeFormWrapper>
          <Field
            component={TextAreaField}
            title="Endre hva komitteen ønsker å høre om fra søkere"
            name="response_label"
            placeholder="Skriv hva komitteen ønsker å vite om søkeren..."
          />
          <Field
            component={TextAreaField}
            title="Endre beskrivelsen av komiteen"
            name="description"
            placeholder="Skriv en beskrivelse av komiteen..."
          />
        </EditCommitteeFormWrapper>
        <SubmitButton
          onClick={handleSubmit}
          type="submit"
          disabled={isSubmitting}
          valid={isValid}
        >
          Submit
        </SubmitButton>
      </FormWrapper>
    </Form>
  );
};

const EditCommitteeForm = withFormik({
  mapPropsToValues({ initialDescription, initialReplyText }) {
    return {
      response_label: initialReplyText || "",
      description: initialDescription || ""
    };
  },
  handleSubmit(
    values,
    {
      props: { committee, committeeId },
      setSubmitting,
      setErrors
    }
  ) {
    const committeeNames = {
      webkom: "Webkom",
      arrkom: "Arrkom",
      bedkom: "Bedkom",
      pr: "PR",
      readme: "readme",
      labamba: "LaBamba",
      fagkom: "Fagkom",
      koskom: "Koskom"
    };
    const submission = {
      name: committeeNames[committee],
      description: values.description,
      response_label: values.response_label
    };

    return callApi(`/committee/${committeeId}/`, {
      method: "PATCH",
      body: JSON.stringify(submission)
    })
      .then(res => {
        setSubmitting(false);
        alert("Komité oppdatert :D");
        return res.jsonData;
      })
      .catch(err => {
        setSubmitting(false);
        let errors = {};
        alert("Det skjedde en feil. Kontakt Webkom");
        Object.keys(err.response.jsonData).forEach(key => {
          errors[key] = err.response.jsonData[key][0];
        });
        setErrors(errors);
        throw err;
      });
  },
  validationSchema: () => {
    return Yup.lazy(() => {
      const schema = {};

      schema.description = Yup.string()
        .min(30, "Skriv mer enn 30 tegn da!")
        .max(300, "Nå er det nok!")
        .required("Beskrivelsen kan ikke være tom!");
      schema.response_label = Yup.string()
        .min(30, "Skriv mer enn 30 tegn da!")
        .max(300, "Nå er det nok!")
        .required("Boksen kan ikke være tom!");
      return Yup.object().shape(schema);
    });
  },
  enableReinitialize: true
})(MyInnerForm);

export { EditCommitteeForm };

/** Styles **/

export const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
`;
