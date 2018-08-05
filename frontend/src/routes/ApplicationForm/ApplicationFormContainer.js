import React, { Component } from "react";
import { Field } from "formik";

import ToggleCommitteeSmall from "src/components/ToggleCommitteeSmall";
import CommitteeApplication from "src/containers/CommitteeApplication";

import MobileApplicationForm from "./MobileApplicationForm";
import ApplicationForm from "./ApplicationForm";

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

  persistState = () => {
    var selectedCommitteesJSON = JSON.stringify(this.state.selectedCommittees);
    sessionStorage.setItem("selectedCommittees", selectedCommitteesJSON);
  };

  initializeState = () => {
    var selectedCommitteesJSON = sessionStorage.getItem("selectedCommittees");
    var selectedCommittees = JSON.parse(selectedCommitteesJSON);
    console.log(selectedCommittees);

    if (selectedCommittees != null) {
      this.setState({
        selectedCommittees: selectedCommittees
      });
    }
  };

  handleApplicationFieldBlur = e => {
    this.props.handleBlur(e);
    console.log("event", e);
    console.log("values", this.props.values);
  };

  render() {
    const { width } = this.state;
    const isMobile = width <= 500;
    const {
      touched,
      errors,
      isSubmitting,
      committees,
      selectedCommittees,
      handleSubmit,
      isValid
    } = this.props;

    const ChooseCommitteesItems = committees.map((committee, index) => (
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

    const SelectedComs = committees
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
          SelectedComs={SelectedComs}
          isSubmitting={isSubmitting}
          isValid={isValid}
          handleSubmit={handleSubmit}
          ChooseCommitteesItems={ChooseCommitteesItems}
        />
      );
    } else {
      return (
        <MobileApplicationForm
          hasSelected={hasSelected}
          SelectedComs={SelectedComs}
          isSubmitting={isSubmitting}
          isValid={isValid}
          handleSubmit={handleSubmit}
          ChooseCommitteesItems={chooseCommitteesItems}
        />
      );
    }
  }
}

export default ApplicationFormContainer;
