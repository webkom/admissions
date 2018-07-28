import React, { Component } from "react";
import { Field } from "formik";

import MobileApplicationForm from "./MobileApplicationForm";
import ApplicationForm from "./ApplicationForm";

import ToggleCommitteeSmall from "src/components/ToggleCommitteeSmall";
import CommitteeApplication from "src/containers/CommitteeApplication";

class ApplicationFormContainer extends Component {
  constructor() {
    super();
    this.state = {
      width: window.innerWidth
    };
  }

  componentWillMount() {
    window.addEventListener("resize", this.handleWindowSizeChange);
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.handleWindowSizeChange);
  }

  handleWindowSizeChange = () => {
    this.setState({ width: window.innerWidth });
  };

  toggleCommittee = name => {
    this.props.toggleCommittee(name.toLowerCase());
  };

  render() {
    const { width } = this.state;
    const isMobile = width <= 500;
    console.log(this.props);
    const {
      touched,
      errors,
      isSubmitting,
      committees,
      selectedCommittees,
      handleSubmit,
      isValid
    } = this.props;

    const chooseCommitteesItems = committees.map((committee, index) => (
      <ToggleCommitteeSmall
        name={committee.name}
        key={committee.name + "-" + index}
        isChosen={!!this.props.selectedCommittees[committee.name.toLowerCase()]}
        toggleCommittee={this.toggleCommittee}
      />
    ));

    const hasSelected =
      committees.filter(
        committee => selectedCommittees[committee.name.toLowerCase()]
      ).length >= 1;

    const selectedComs = committees
      .filter(committee => selectedCommittees[committee.name.toLowerCase()])
      .map(({ name, response_label }, index) => (
        <Field
          component={CommitteeApplication}
          committee={name}
          name={name.toLowerCase()}
          responseLabel={response_label}
          error={touched[name.toLowerCase()] && errors[name.toLowerCase()]}
          key={`${name.toLowerCase()} ${index}`}
        />
      ));

    if (!isMobile) {
      return (
        <ApplicationForm
          hasSelected={hasSelected}
          selectedComs={selectedComs}
          isSubmitting={isSubmitting}
          isValid={isValid}
          handleSubmit={handleSubmit}
          chooseCommitteesItems={chooseCommitteesItems}
        />
      );
    } else {
      return (
        <MobileApplicationForm
          hasSelected={hasSelected}
          selectedComs={selectedComs}
          isSubmitting={isSubmitting}
          isValid={isValid}
          handleSubmit={handleSubmit}
          chooseCommitteesItems={chooseCommitteesItems}
        />
      );
    }
  }
}

export default ApplicationFormContainer;
