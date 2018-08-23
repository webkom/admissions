import { withFormik } from "formik";
import * as Yup from "yup";
import Cookie from "js-cookie";

import ApplicationForm from "./ApplicationFormContainer";
import callApi from "src/utils/callApi";

const FormikApp = withFormik({
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
      resetForm,
      setSubmitting,
      setFieldValue
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

    console.log(submission);
    callApi("/application/", {
      method: "POST",
      body: JSON.stringify(submission)
    }).then(
      res => {
        console.log("Submit result", res);
        setSubmitting(false);
        window.location = "/myapplications";
      },
      err => {
        console.log(err);
      }
    );
  },
  validationSchema: props => {
    return Yup.lazy(values => {
      var selectedCommittees = Object.keys(values).filter(
        committee => props.selectedCommittees[committee]
      );
      const schema = {};
      selectedCommittees.forEach(name => {
        schema[name] = Yup.string()
          .min(20, "Det var da litt kort? 20 bokstaver klarer du iallefall :)")
          .required("Søknadsteksten kan ikke være tom!");
      });
      return Yup.object().shape(schema);
    });
  },
  displayName: "ApplicationForm",
  validateOnChange: true,
  enableReinitialize: true
})(ApplicationForm);

export default FormikApp;
