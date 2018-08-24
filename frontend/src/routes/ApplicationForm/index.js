import React, { Component } from "react";
import { withFormik, Field } from "formik";
import * as Yup from "yup";
import callApi from "src/utils/callApi";

import CommitteeApplication from "src/containers/CommitteeApplication";
import ToggleCommitteeSmall from "src/components/ToggleCommitteeSmall";

import FormStructure from "./FormStructure";

// State of the form
class FormContainer extends Component {
  constructor() {
    super();
    this.state = {
      width: window.innerWidth,
      isMobile: false
    };
  }

  componentDidMount() {
    this.setState({ isMobile: this.state.width <= 500 });
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

    if (selectedCommittees != null) {
      this.setState({
        selectedCommittees: selectedCommittees
      });
    }
  };

  handleApplicationFieldBlur = e => {
    this.props.handleBlur(e);
  };

  render() {
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

    // This is where the actual form structure comes in.
    return (
      <FormStructure
        hasSelected={hasSelected}
        SelectedComs={SelectedComs}
        isSubmitting={isSubmitting}
        isValid={isValid}
        handleSubmit={handleSubmit}
        ChooseCommitteesItems={ChooseCommitteesItems}
        isMobile={this.state.isMobile}
      />
    );
  }
}

// Highest order component for application form.
// Handles form values, submit post and form validation.
const ApplicationForm = withFormik({
  mapPropsToValues({ myApplications = {} }) {
    const {
      text = sessionStorage.getItem("text") || "",
      phone_number = sessionStorage.getItem("phoneNumber") || "",
      committee_applications = []
    } = myApplications;

    return {
      webkom: "",
      fagkom: "",
      bedkom: "",
      readme: "",
      labamba: "",
      koskom: "",
      arrkom: "",
      pr: "",
      priorityText: text,
      phoneNumber: phone_number,
      ...committee_applications.reduce(
        (obj, a) => ({ ...obj, [a.committee.name.toLowerCase()]: a.text }),
        {}
      )
    };
  },
  handleSubmit(
    values,
    {
      props: { selectedCommittees },
      setSubmitting
    }
  ) {
    var submission = {
      text: values.priorityText,
      applications: {},
      phone_number: values.phoneNumber
    };
    Object.keys(values)
      .filter(committee => selectedCommittees[committee])
      .forEach(name => {
        submission.applications[name] = values[name];
      });
    callApi("/application/", {
      method: "POST",
      body: JSON.stringify(submission)
    }).then(() => {
      setSubmitting(false);
      window.location = "/myapplications";
    });
  },

  validationSchema: props => {
    return Yup.lazy(values => {
      var selectedCommittees = Object.keys(values).filter(
        committee => props.selectedCommittees[committee]
      );
      const schema = {};
      selectedCommittees.forEach(name => {
        schema[name] = Yup.string().required(
          "Søknadsteksten kan ikke være tom!"
        );
      });
      schema.phoneNumber = Yup.number().required(
        "Vennligst fyll inn ditt mobilnummer."
      );
      return Yup.object().shape(schema);
    });
  },
  displayName: "ApplicationForm",
  validateOnChange: true,
  enableReinitialize: true
})(FormContainer);

export default ApplicationForm;
