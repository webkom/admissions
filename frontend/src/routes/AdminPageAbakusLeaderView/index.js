import React, { Component } from "react";
import { CSVLink } from "react-csv";
import Raven from "raven-js";
import callApi from "src/utils/callApi";

import djangoData from "src/utils/djangoData";
import UserInfo from "src/components/UserInfo";
import PageWrapper from "src/components/PageWrapper";
import AbakusLogo from "src/components/AbakusLogo";
import PageTitle from "src/components/PageTitle";
import UserApplicationAdminView from "src/containers/UserApplicationAdminView";

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
        { label: "Prioriteringer", key: "priorityText" },
        { label: "Komité", key: "committee" },
        { label: "Søknadstekst", key: "committeeApplicationText" },
        { label: "Email", key: "email" },
        { label: "Username", key: "username" },
        { label: "Tid sendt", key: "timeSent" }
      ]
    };
  }

  generateCSVData = (
    name,
    email,
    username,
    timeSent,
    priorityText,
    committee,
    committeeApplicationText
  ) => {
    this.setState(prevState => ({
      ...prevState,
      csvData: [
        ...prevState.csvData,
        {
          name: name,
          email: email,
          username: username,
          priorityText:
            priorityText != "" ? priorityText : "Ingen prioriteringer",
          committee: committee,
          committeeApplicationText: committeeApplicationText,
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
    const UserApplications = applications.map((userApplication, i) => {
      return (
        <UserApplicationAdminView
          key={i}
          {...userApplication}
          generateCSVData={this.generateCSVData}
        />
      );
    });

    const numApplicants = applications.length;

    var numApplications = 0;
    applications.map(application => {
      numApplications += application.committee_applications.length;
    });

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
              {djangoData.is_superuser && (
                <StatisticsWrapper>
                  <StatisticsName>Totalt antall søknader</StatisticsName>
                  {numApplications}{" "}
                  {numApplications == 1 ? "søknad" : "søknader"}
                </StatisticsWrapper>
              )}
              {djangoData.is_superuser && (
                <Statistics>
                  <CommitteeStatistics
                    applications={applications}
                    committee="Arrkom"
                  />
                  <CommitteeStatistics
                    applications={applications}
                    committee="Bedkom"
                  />
                  <CommitteeStatistics
                    applications={applications}
                    committee="Fagkom"
                  />
                  <CommitteeStatistics
                    applications={applications}
                    committee="Koskom"
                  />
                  <CommitteeStatistics
                    applications={applications}
                    committee="LaBamba"
                  />
                  <CommitteeStatistics
                    applications={applications}
                    committee="PR"
                  />
                  <CommitteeStatistics
                    applications={applications}
                    committee="readme"
                  />
                  <CommitteeStatistics
                    applications={applications}
                    committee="Webkom"
                  />
                </Statistics>
              )}
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
