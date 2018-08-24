import React, { Component } from "react";
import djangoData from "src/utils/djangoData";
import callApi from "src/utils/callApi";
import { withFormik, Field, Form } from "formik";
import * as Yup from "yup";

import PageWrapper from "src/components/PageWrapper";
import PageTitle from "src/components/PageTitle";
import TextAreaField from "src/components/TextAreaField";
import UserApplication from "src/containers/UserApplication";

import CSRFToken from "./csrftoken";
import Wrapper from "./Wrapper";
import LinkLink from "./LinkLink";
import CSVExport from "./CSVExport";
import Statistics from "./Statistics";
import StatisticsName from "./StatisticsName";
import StatisticsWrapper from "./StatisticsWrapper";
import SubmitButton from "./SubmitButton";
import FormWrapper from "./FormWrapper";

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
          <LinkLink to="/">Gå til forside</LinkLink>
          <h2>{djangoData.user.leader_of_committee}</h2>
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

        <Field
          component={TextAreaField}
          name="replyText"
          placeholder="Edit the reply text"
          title="Endre hva komitteen ønsker å høre om fra søkere"
        />
        <Field
          component={TextAreaField}
          title="Endre beskrivelsen av komiteen"
          name="description"
          placeholder="Edit the description of the committee"
        />

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
      replyText: initialReplyText || "",
      description: initialDescription || ""
    };
  },
  handleSubmit(
    values,
    {
      props: { committee, committeeId },
      setSubmitting
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
      response_label: values.replyText
    };

    callApi(`/committee/${committeeId}/`, {
      method: "PATCH",
      body: JSON.stringify(submission)
    })
      .then(res => {
        setSubmitting(false);
        alert("Komité oppdatert :D");
        return res.jsonData;
      })
      .catch(err => {
        alert("rip feil. Snakk med webkom");
        throw err;
      });
  },
  validationSchema: () => {
    return Yup.lazy(() => {
      const schema = {};

      schema.description = Yup.string()
        .min(30, "Skriv mer enn 30 tegn da!")
        .max(200, "Nå er det nok!")
        .required("Beskrivelsen kan ikke være tom!");
      schema.replyText = Yup.string()
        .min(30, "Skriv mer enn 30 tegn da!")
        .max(200, "Nå er det nok!")
        .required("Boksen kan ikke være tom!");
      return Yup.object().shape(schema);
    });
  },
  enableReinitialize: true
})(MyInnerForm);

export { EditCommitteeForm };
