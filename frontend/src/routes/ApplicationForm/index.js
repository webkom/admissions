import { withFormik } from "formik";
import * as Yup from "yup";
import Cookie from "js-cookie";
import Raven from "raven-js";

import ApplicationForm from "./ApplicationFormContainer";

const FormikApp = withFormik({
  mapPropsToValues() {
    return {
      webkom: "",
      fagkom: "",
      bedkom: "",
      readme: "",
      labamba: "",
      koskom: "",
      arrkom: "",
      pr: "",
      priorityText: ""
    };
  },
  handleSubmit(
    values,
    {
      props: { selectedCommittees, apiRoot },
      resetForm,
      setSubmitting,
      setFieldValue
    }
  ) {
    var submission = {
      text: values.priorityText,
      applications: {}
    };
    Object.keys(values)
      .filter(committee => selectedCommittees[committee])
      .forEach(name => {
        submission.applications[name] = values[name];
      });

    console.log(submission);

    fetch(`${apiRoot}/api/application/`, {
      method: "POST",
      headers: new Headers({
        Accept: "application/json",
        "Content-Type": "application/json",
        "Access-Control-Allow-Credentials": true,
        "X-CSRFToken": Cookie.get("csrftoken")
      }),
      redirect: "follow",
      credentials: "include",
      body: JSON.stringify(submission)
    }).then(
      res => {
        console.log("Submit result", res);
        setSubmitting(false);
        return res;
      },
      err => {
        console.log(err);
        Raven.captureException(err);
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
  validateOnChange: true
})(ApplicationForm);

export default FormikApp;
