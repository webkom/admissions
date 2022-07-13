import React, { Component } from "react";
import styled from "styled-components";
import * as Sentry from "@sentry/browser";
import { withFormik, Field, Form } from "formik";
import * as Yup from "yup";

import callApi from "src/utils/callApi";
import djangoData from "src/utils/djangoData";
import { media } from "src/styles/mediaQueries";

import UserApplication from "src/containers/UserApplication";
import TextAreaField from "src/components/TextAreaField";
import LoadingBall from "src/components/LoadingBall";

import CSRFToken from "./csrftoken";

import { replaceQuotationMarks } from "../../utils/replaceQuotationMarks";

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

const committee_logos = {
  webkom: require("assets/committee_logos/webkom.png"),
  arrkom: require("assets/committee_logos/arrkom.png"),
  bankkom: require("assets/committee_logos/bankkom.png"),
  bedkom: require("assets/committee_logos/bedkom.png"),
  pr: require("assets/committee_logos/pr.png"),
  readme: require("assets/committee_logos/readme.png"),
  labamba: require("assets/committee_logos/labamba.png"),
  fagkom: require("assets/committee_logos/fagkom.png"),
  koskom: require("assets/committee_logos/koskom.png")
};

class AdminPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      results: undefined,
      error: null,
      user: { name: "" },
      applications: [],
      csvData: [],
      isFetching: true,
      headers: [
        { label: "Full Name", key: "name" },
        { label: "Søknadstekst", key: "applicationText" },
        { label: "Mobilnummer", key: "phoneNumber" },
        { label: "Email", key: "email" },
        { label: "Username", key: "username" },
        { label: "Søkt innen frist", key: "appliedWithinDeadline" },
        { label: "Tid sendt", key: "createdAt" },
        { label: "Tid oppdatert", key: "updatedAt" }
      ],
      committeeNames: {
        webkom: "Webkom",
        arrkom: "Arrkom",
        bankkom: "Bankkom",
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
    createdAt,
    updatedAt,
    appliedWithinDeadline,
    applicationText,
    phoneNumber
  ) => {
    this.setState(prevState => ({
      ...prevState,
      csvData: [
        ...prevState.csvData,
        {
          name,
          email,
          username,
          applicationText: replaceQuotationMarks(applicationText),
          createdAt,
          updatedAt,
          appliedWithinDeadline,
          phoneNumber
        }
      ]
    }));
  };

  componentDidMount() {
    callApi("/application/").then(
      ({ jsonData }) => {
        this.setState({
          applications: jsonData,
          isFetching: false
        });
      },
      error => {
        this.setState({ error, isFetching: false });
      }
    );

    this.setState({
      user: { name: djangoData.user && djangoData.user.full_name }
    });
    Sentry.setUser(djangoData.user);
  }

  render() {
    const { error, isFetching, applications, csvData, headers } = this.state;

    applications.sort(function(a, b) {
      if (a.user.full_name < b.user.full_name) return -1;
      if (a.user.full_name > b.user.full_name) return 1;
      return 0;
    });
    const filteredApplications = applications.filter(userApplication => {
      var filteredComApp = userApplication.committee_applications.filter(
        committeeApplication =>
          committeeApplication.committee.name.toLowerCase() ==
          djangoData.user.representative_of_committee.toLowerCase()
      );

      return filteredComApp.length > 0;
    });

    // Render applications from users
    const UserApplications = filteredApplications.map((userApplication, i) => {
      return (
        <UserApplication
          key={i}
          {...userApplication}
          whichCommitteeLeader={djangoData.user.representative_of_committe}
          generateCSVData={this.generateCSVData}
        />
      );
    });
    const committee = this.props.committees.find(
      committee =>
        committee.name.toLowerCase() ===
        djangoData.user.representative_of_committee.toLowerCase()
    );

    const committeeId = committee && committee.pk;

    const numApplicants = filteredApplications.length;

    if (error) {
      return <div>Error: {error.message}</div>;
    } else if (isFetching) {
      return <LoadingBall />;
    } else {
      return (
        <PageWrapper>
          <PageTitle>Admin Panel</PageTitle>
          <CommitteeLogoWrapper>
            <CommitteeLogo
              src={
                committee_logos[
                  djangoData.user.representative_of_committee.toLowerCase()
                ]
              }
            />
            <h2>{djangoData.user.representative_of_committee}</h2>
          </CommitteeLogoWrapper>
          <LinkLink to="/">Gå til forside</LinkLink>

          <Wrapper>
            <EditCommitteeForm
              apiRoot={this.API_ROOT}
              committee={djangoData.user.representative_of_committee}
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
            title="Endre beskrivelsen av komiteen"
            name="description"
            placeholder="Skriv en beskrivelse av komiteen..."
          />
          <Field
            component={TextAreaField}
            title="Endre hva komitteen ønsker å høre om fra søkere"
            name="response_label"
            placeholder="Skriv hva komitteen ønsker å vite om søkeren..."
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
      bankkom: "Bankkom",
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

const PageTitle = styled.h1`
  ${media.handheld`
    margin: 0 1em 0 1em;
    font-size: 2.5rem;
  `};
`;
