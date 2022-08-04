import React, { useEffect, useState } from "react";
import styled from "styled-components";
import * as Sentry from "@sentry/browser";
import { withFormik, Field, Form } from "formik";
import * as Yup from "yup";

import callApi from "src/utils/callApi";
import { useApplications, useGroups } from "../../query/hooks";
import djangoData from "src/utils/djangoData";
import { media } from "src/styles/mediaQueries";

import UserApplication from "src/containers/UserApplication";
import TextAreaField from "src/components/TextAreaField";
import LoadingBall from "src/components/LoadingBall";

import CSRFToken from "./csrftoken";

import { replaceQuotationMarks } from "../../utils/replaceQuotationMarks";

import {
  EditGroupFormWrapper,
  FormWrapper,
  SubmitButton,
  Wrapper,
  LinkLink,
  CSVExport,
  Statistics,
  StatisticsName,
  StatisticsWrapper,
  GroupLogo,
  GroupLogoWrapper,
} from "./styles";

const AdminPage = () => {
  const [sortedApplications, setSortedApplications] = useState([]);
  const [csvData, setCsvData] = useState([]);

  const csvHeaders = [
    { label: "Full Name", key: "name" },
    { label: "Søknadstekst", key: "applicationText" },
    { label: "Mobilnummer", key: "phoneNumber" },
    { label: "Email", key: "email" },
    { label: "Username", key: "username" },
    { label: "Søkt innen frist", key: "appliedWithinDeadline" },
    { label: "Tid sendt", key: "createdAt" },
    { label: "Tid oppdatert", key: "updatedAt" },
  ];

  const { data: applications, isFetching, error } = useApplications();
  const { data: groups } = useGroups();

  useEffect(() => {
    Sentry.setUser(djangoData.user);
  }, []);

  useEffect(() => {
    if (!applications) return;
    setSortedApplications(
      [...applications].sort((a, b) => {
        if (a.user.full_name < b.user.full_name) return -1;
        if (a.user.full_name > b.user.full_name) return 1;
        return 0;
      })
    );
  }, [applications]);

  useEffect(() => {
    // Push all the individual applications into csvData with the right format
    const updatedCsvData = [];
    sortedApplications.forEach((userApplication) => {
      updatedCsvData.push({
        name: userApplication.user.full_name,
        email: userApplication.user.email,
        username: userApplication.user.username,
        applicationText: replaceQuotationMarks(
          userApplication.group_applications[0].text
        ),
        createdAt: userApplication.created_at,
        updatedAt: userApplication.updated_at,
        appliedWithinDeadline: userApplication.applied_within_deadline,
        phoneNumber: userApplication.phone_number,
      });
    });
    setCsvData(updatedCsvData);
  }, [sortedApplications]);

  const group = groups.find(
    (group) =>
      group.name.toLowerCase() ===
      djangoData.user.representative_of_group.toLowerCase()
  );

  const numApplicants = sortedApplications.length;

  if (error) {
    return <div>Error: {error.message}</div>;
  } else if (isFetching) {
    return <LoadingBall />;
  } else {
    return (
      <PageWrapper>
        <PageTitle>Admin Panel</PageTitle>
        <GroupLogoWrapper>
          <GroupLogo src={group.logo} />
          <h2>{djangoData.user.representative_of_group}</h2>
        </GroupLogoWrapper>
        <LinkLink to="/">Gå til forside</LinkLink>

        <Wrapper>
          <EditGroupForm
            initialDescription={group && group.description}
            initialReplyText={group && group.response_label}
            group={group}
          />
        </Wrapper>
        <Wrapper>
          <Statistics>
            <StatisticsWrapper>
              <StatisticsName>Antall søkere</StatisticsName>
              {numApplicants} {numApplicants == 1 ? "søker" : "søkere"}
            </StatisticsWrapper>
          </Statistics>
          <CSVExport
            data={csvData}
            headers={csvHeaders}
            filename={"applications.csv"}
            target="_blank"
          >
            Eksporter som csv
          </CSVExport>
          {sortedApplications.map((userApplication) => (
            <UserApplication
              key={userApplication.user.username}
              {...userApplication}
            />
          ))}
        </Wrapper>
      </PageWrapper>
    );
  }
};

export default AdminPage;

const MyInnerForm = ({ isSubmitting, handleSubmit, isValid }) => {
  return (
    <Form>
      <FormWrapper>
        <CSRFToken />
        <EditGroupFormWrapper>
          <Field
            component={TextAreaField}
            title="Endre beskrivelsen av komiteen"
            name="description"
            placeholder="Skriv en beskrivelse av komiteen..."
          />
          <Field
            component={TextAreaField}
            title="Endre hva komitteen ønsker å høre om fra søkere"
            name="response_label"
            placeholder="Skriv hva komitteen ønsker å vite om søkeren..."
          />
        </EditGroupFormWrapper>
        <SubmitButton
          onClick={handleSubmit}
          type="submit"
          disabled={isSubmitting}
          valid={isValid}
        >
          Submit
        </SubmitButton>
      </FormWrapper>
    </Form>
  );
};

const EditGroupForm = withFormik({
  mapPropsToValues({ initialDescription, initialReplyText }) {
    return {
      response_label: initialReplyText || "",
      description: initialDescription || "",
    };
  },
  handleSubmit(values, { props: { group }, setSubmitting, setErrors }) {
    const submission = {
      name: group.name,
      description: values.description,
      response_label: values.response_label,
    };

    return callApi(`/group/${group.pk}/`, {
      method: "PATCH",
      body: JSON.stringify(submission),
    })
      .then((res) => {
        setSubmitting(false);
        alert("Gruppe oppdatert :D");
        return res.jsonData;
      })
      .catch((err) => {
        setSubmitting(false);
        let errors = {};
        alert("Det skjedde en feil. Kontakt Webkom");
        Object.keys(err.response.jsonData).forEach((key) => {
          errors[key] = err.response.jsonData[key][0];
        });
        setErrors(errors);
        throw err;
      });
  },
  validationSchema: () => {
    return Yup.lazy(() => {
      const schema = {};

      schema.description = Yup.string()
        .min(30, "Skriv mer enn 30 tegn da!")
        .max(300, "Nå er det nok!")
        .required("Beskrivelsen kan ikke være tom!");
      schema.response_label = Yup.string()
        .min(30, "Skriv mer enn 30 tegn da!")
        .max(300, "Nå er det nok!")
        .required("Boksen kan ikke være tom!");
      return Yup.object().shape(schema);
    });
  },
  enableReinitialize: true,
})(MyInnerForm);

export { EditGroupForm };

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
