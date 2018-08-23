import React, { Component } from "react";
import { CSVLink } from "react-csv";
import djangoData from "src/utils/djangoData";
import Raven from "raven-js";
import callApi from "src/utils/callApi";
import { withFormik, Formik, Field, Form } from "formik";
import * as Yup from "yup";
import Textarea from "react-textarea-autosize";
import Cookie from "js-cookie";

import UserInfo from "src/components/UserInfo";
import PageWrapper from "src/components/PageWrapper";
import AbakusLogo from "src/components/AbakusLogo";
import PageTitle from "src/components/PageTitle";
import UserApplication from "src/containers/UserApplication";

import CSRFToken from "./csrftoken";
import Wrapper from "./Wrapper";
import LinkLink from "./LinkLink";
import CSVExport from "./CSVExport";
import Statistics from "./Statistics";
import CommitteeStatistics from "./CommitteeStatistics";
import StatisticsName from "./StatisticsName";
import StatisticsWrapper from "./StatisticsWrapper";
import SubmitButton from "./SubmitButton";

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
        console.log(error);
        this.setState({ error });
      }
    );

    this.setState({
      user: { name: djangoData.user && djangoData.user.full_name }
    });
  }

  render() {
    const { error, user, applications, csvData, headers } = this.state;

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
          {djangoData.user.leader_of_committee}
          <Wrapper>
            <EditCommitteeForm
              apiRoot={this.API_ROOT}
              committee={djangoData.user.leader_of_committee}
              committeeId={committeeId}
            />
          </Wrapper>
          ;
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
  const {
    values,
    touched,
    errors,
    dirty,
    isSubmitting,
    handleChange,
    handleBlur,
    handleSubmit,
    handleReset
  } = props;
  return (
    <Form>
      <CSRFToken />

      <Field name="replyText" placeholder="Edit the reply text" type="text" />
      <Field
        name="description"
        placeholder="Edit the description of the committee"
        type="text"
      />

      <SubmitButton
        onClick={handleSubmit}
        type="submit"
        disabled={isSubmitting}
      >
        Submit
      </SubmitButton>
    </Form>
  );
};

const EditCommitteeForm = withFormik({
  mapPropsToValues() {
    return {
      replyText: "write reply text here",
      description: "description here"
    };
  },
  handleSubmit(
    values,
    {
      props: { committee, committeeId },
      resetForm,
      setSubmitting,
      setFieldValue
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
        console.log("UPDATE COMMITTEE: Submit result", res);
        setSubmitting(false);
        return res.jsonData;
      })
      .catch(err => console.log("UPDATE COMMITTEE ERROR:", err));
  }
})(MyInnerForm);

export { EditCommitteeForm };
