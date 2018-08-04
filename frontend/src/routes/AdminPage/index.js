import React, { Component } from "react";
import { Link } from "react-router-dom";
import UserInfo from "src/components/UserInfo";
import PageWrapper from "src/components/PageWrapper";
import AbakusLogo from "src/components/AbakusLogo";
import PageTitle from "src/components/PageTitle";

class AdminPage extends Component {
  constructor(props) {
    super(props);
    this.state = { user: { name: "" } };
  }

  componentDidMount() {
    this.setState({ user: { name: window.django.user.full_name } }, () =>
      console.log(this.state)
    );
  }

  render() {
    const { user } = this.state;
    return (
      <PageWrapper>
        <AbakusLogo size={"6em"} />
        <UserInfo name={user.name} />
        <PageTitle>Admin Panel</PageTitle>

        <Link to="/">Gå til forside</Link>
      </PageWrapper>
    );
  }
}

export default AdminPage;
