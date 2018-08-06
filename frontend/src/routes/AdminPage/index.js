import React, { Component } from "react";
import { Link } from "react-router-dom";
import { CSVLink } from "react-csv";

import UserInfo from "src/components/UserInfo";
import PageWrapper from "src/components/PageWrapper";
import AbakusLogo from "src/components/AbakusLogo";
import PageTitle from "src/components/PageTitle";
import UserApplication from "src/containers/UserApplication";

import Wrapper from "./Wrapper";
import CSVExport from "./CSVExport";

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

    const hostname = window && window.location && window.location.hostname;
    if (hostname === "opptak.abakus.no") {
      this.API_ROOT = "https://opptak.abakus.no";
    } else {
      this.API_ROOT = "http://localhost:8000";
    }
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
    fetch(`${this.API_ROOT}/api/application/`, {
      method: "GET",
      headers: new Headers({
        Accept: "application/json",
        "Content-Type": "application/json",
        "Access-Control-Allow-Credentials": true
      }),
      redirect: "manual",
      credentials: "include"
    })
      .then(res => {
        if (res.type === "opaqueredirect") {
          window.location = `http://localhost:8000/login/lego/?next=${
            window.location.pathname
          }`;
          throw res;
        }
        return res;
      })
      .then(results => results.json())
      .then(
        data => {
          this.setState({
            applications: data
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
    const { error, user, applications, csvData, headers } = this.state;
    applications.sort(function(a, b) {
      if (a.user.full_name < b.user.full_name) return -1;
      if (a.user.full_name > b.user.full_name) return 1;
      return 0;
    });
    const UserApplications = applications.map((userApplication, i) => {
      return (
        <UserApplication
          key={i}
          {...userApplication}
          generateCSVData={this.generateCSVData}
        />
      );
    });

    if (error) {
      return <div>Error: {error.message}</div>;
    } else {
      return (
        <PageWrapper>
          <PageTitle>Admin Panel</PageTitle>
          <Link to="/">Gå til forside</Link>
          <Wrapper>
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
