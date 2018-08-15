import React, { Component } from "react";
import { CSVLink } from "react-csv";
import Raven from "raven-js";

import callApi from "src/utils/callApi";

import UserInfo from "src/components/UserInfo";
import PageWrapper from "src/components/PageWrapper";
import AbakusLogo from "src/components/AbakusLogo";
import PageTitle from "src/components/PageTitle";
import UserApplication from "src/containers/UserApplication";

import Wrapper from "./Wrapper";
import LinkLink from "./LinkLink";
import CSVExport from "./CSVExport";
import Statistics from "./Statistics";
import CommitteeStatistics from "./CommitteeStatistics";
import StatisticsName from "./StatisticsName";
import StatisticsWrapper from "./StatisticsWrapper";

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
        { label: "Email", key: "email" },
        { label: "Username", key: "username" },
        { label: "Tid sendt", key: "timeSent" }
      ],
      whichCommitteeLeader: "webkom"
    };
  }

  generateCSVData = (name, email, username, timeSent, applicationText) => {
    this.setState(prevState => ({
      ...prevState,
      csvData: [
        ...prevState.csvData,
        {
          name: name,
          email: email,
          username: username,
          applicationText: applicationText,
          timeSent: timeSent
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

    this.setState({ user: { name: window.django.user.full_name } });
  }

  render() {
    const {
      error,
      user,
      applications,
      csvData,
      headers,
      whichCommitteeLeader
    } = this.state;

    applications.sort(function(a, b) {
      if (a.user.full_name < b.user.full_name) return -1;
      if (a.user.full_name > b.user.full_name) return 1;
      return 0;
    });
    const filteredApplications = applications.filter(userApplication => {
      var filteredComApp = userApplication.committee_applications.filter(
        committeeApplication =>
          committeeApplication.committee.name.toLowerCase() ==
          whichCommitteeLeader
      );

      return filteredComApp.length > 0;
    });
    console.log(filteredApplications);
    // Render applications from users
    const UserApplications = filteredApplications.map((userApplication, i) => {
      return (
        <UserApplication
          key={i}
          {...userApplication}
          whichCommitteeLeader={this.state.whichCommitteeLeader}
          generateCSVData={this.generateCSVData}
        />
      );
    });

    const numApplicants = filteredApplications.length;

    if (error) {
      return <div>Error: {error.message}</div>;
    } else {
      return (
        <PageWrapper>
          <PageTitle>Admin Panel</PageTitle>
          <LinkLink to="/">Gå til forside</LinkLink>
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
