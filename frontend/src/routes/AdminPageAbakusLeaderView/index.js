import React, { Component } from "react";
import styled from "styled-components";
import Moment from "react-moment";
import "moment/locale/nb";
Moment.globalLocale = "nb";

import callApi from "src/utils/callApi";

import djangoData from "src/utils/djangoData";
import UserApplicationAdminView from "src/containers/UserApplicationAdminView";
import { media } from "src/styles/mediaQueries";

import LoadingBall from "src/components/LoadingBall";
import Wrapper from "./Wrapper";
import LinkLink from "./LinkLink";
import CSVExport from "./CSVExport";
import Statistics from "./Statistics";
import CommitteeStatistics from "./CommitteeStatistics";
import StatisticsName from "./StatisticsName";
import StatisticsWrapper from "./StatisticsWrapper";
import { replaceQuotationMarks } from "../../utils/replaceQuotationMarks";

class AdminPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      results: undefined,
      error: null,
      isFetching: true,
      user: { name: "" },
      admission: null,
      applications: [],
      csvData: [],
      headers: [
        { label: "Full Name", key: "name" },
        { label: "Prioriteringer", key: "priorityText" },
        { label: "Komité", key: "committee" },
        { label: "Søknadstekst", key: "committeeApplicationText" },
        { label: "Email", key: "email" },
        { label: "Mobilnummer", key: "phoneNumber" },
        { label: "Username", key: "username" },
        { label: "Søkt innen frist", key: "appliedWithinDeadline" },
        { label: "Tid sendt", key: "createdAt" },
        { label: "Tid oppdatert", key: "updatedAt" },
      ],
    };
  }

  generateCSVData = (
    name,
    email,
    username,
    createdAt,
    updatedAt,
    appliedWithinDeadline,
    priorityText,
    committee,
    committeeApplicationText,
    phoneNumber
  ) => {
    this.setState((prevState) => ({
      ...prevState,
      csvData: [
        ...prevState.csvData,
        {
          name,
          email,
          username,
          createdAt,
          updatedAt,
          appliedWithinDeadline,
          priorityText:
            priorityText != ""
              ? replaceQuotationMarks(priorityText)
              : "Ingen prioriteringer",
          committee,
          committeeApplicationText: replaceQuotationMarks(
            committeeApplicationText
          ),
          phoneNumber,
        },
      ],
    }));
  };

  componentDidMount() {
    Promise.all([callApi("/application/"), callApi("/admission/")])
      .then((data) => {
        data.map(({ url, jsonData }) => {
          if (url.includes("/application/")) {
            this.setState({
              applications: jsonData,
            });
          } else if (url.includes("/admission/")) {
            this.setState({
              admission: jsonData[0],
            });
          }
        });
        this.setState({
          isFetching: false,
        });
      })
      .catch((error) => {
        this.setState({ error, isFetching: false });
      });

    this.setState({
      user: { name: djangoData.user && djangoData.user.full_name },
    });
  }

  render() {
    const { error, isFetching, admission, applications, csvData, headers } =
      this.state;
    applications.sort(function (a, b) {
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
    applications.map((application) => {
      numApplications += application.committee_applications.length;
    });

    if (error) {
      return <div>Error: {error.message}</div>;
    } else if (isFetching) {
      return <LoadingBall />;
    } else {
      return (
        <PageWrapper>
          <PageTitle>Admin Panel</PageTitle>
          <LinkLink to="/">Gå til forside</LinkLink>
          <Wrapper>
            <Statistics>
              <StatisticsWrapper>
                <StatisticsName>Søknader åpner</StatisticsName>
                <Moment format="HH:mm:ss dddd Do MMMM">
                  {admission.open_from}
                </Moment>
              </StatisticsWrapper>
              <StatisticsWrapper>
                <StatisticsName>Søknadsfrist</StatisticsName>
                <Moment format="HH:mm:ss dddd Do MMMM">
                  {admission.public_deadline}
                </Moment>
              </StatisticsWrapper>
              <StatisticsWrapper>
                <StatisticsName>Redigeringsfrist</StatisticsName>
                <Moment format="HH:mm:ss dddd Do MMMM">
                  {admission.application_deadline}
                </Moment>
              </StatisticsWrapper>
            </Statistics>
            <Statistics>
              <StatisticsWrapper>
                <StatisticsName>Antall søkere</StatisticsName>
                {numApplicants} {numApplicants == 1 ? "søker" : "søkere"}
              </StatisticsWrapper>
              <StatisticsWrapper>
                <StatisticsName>Totalt antall søknader</StatisticsName>
                {numApplications} {numApplications == 1 ? "søknad" : "søknader"}
              </StatisticsWrapper>

              <Statistics>
                <CommitteeStatistics
                  applications={applications}
                  committee="Arrkom"
                />
                <CommitteeStatistics
                  applications={applications}
                  committee="Bankkom"
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
