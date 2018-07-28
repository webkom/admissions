import { withFormik } from "formik";
import Yup from "yup";
import ApplicationFormContainer from "./ApplicationFormContainer";

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
      pr: ""
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
      text: "Webkom først, så Arrkom takk. HOHOHO",
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
        Authorization: "Token fe37584f85a9430be9e799bceddc62d8ee751016"
      }),
      redirect: "follow",
      body: JSON.stringify(submission)
    })
      .then(res => {
        console.log("Submit result", res);
        setSubmitting(false);
        return res;
      })
      .catch(err => console.log(err));
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
})(ApplicationFormContainer);

export default FormikApp;
