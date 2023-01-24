import { useFormik } from "formik";
import { DateTime } from "luxon";
import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import LegoButton from "src/components/LegoButton";
import { useAdmission } from "src/query/hooks";
import { Group } from "src/types";
import { toggleFromArray } from "src/utils/methods";
import styled from "styled-components";
import GroupSelector from "./components/GroupSelector";

const formatDateString = (dateString?: string) =>
  formatDate(DateTime.fromISO(dateString ?? ""));
const formatCurrentDate = () => formatDate(DateTime.now());
const formatDate = (date: DateTime) => date.toFormat("yyyy-MM-d'T'hh:mm:ss");

const CreateAdmission: React.FC = () => {
  const { admissionId } = useParams();
  const { data: admission, isLoading } = useAdmission(
    admissionId ?? "",
    admissionId !== undefined
  );

  const isNew = !admissionId;

  const formik = useFormik({
    initialValues: {
      title: "",
      slug: "",
      openTime: formatCurrentDate(),
      deadline: formatCurrentDate(),
      closeTime: formatCurrentDate(),
      adminGroups: [],
      groups: [],
    },
    onSubmit: (values) => {
      console.log(JSON.stringify(values, null, 2));
    },
  });

  useEffect(() => {
    if (admission) {
      formik.setValues({
        title: admission.title,
        slug: "",
        openTime: formatDateString(admission.open_from),
        deadline: formatDateString(admission.public_deadline),
        closeTime: formatDateString(admission.application_deadline),
        adminGroups: [],
        groups: [],
      });
    }
  }, [admission]);

  if (isLoading && admissionId !== undefined) {
    return <></>;
  }

  return (
    <form onSubmit={formik.handleSubmit}>
      <Title>
        {isNew ? "Opprett nytt opptak" : "Redigerer: " + admission?.title}
      </Title>
      <FormGroup>
        <InputWrapper>
          <InputTitle>Tittel</InputTitle>
          <InputDescription>
            Navnet som vises for brukere når de søker på opptaket
          </InputDescription>
          <Input
            name="title"
            value={formik.values.title}
            onChange={formik.handleChange}
          />
        </InputWrapper>
        <InputWrapper>
          <InputTitle>Slug</InputTitle>
          <InputDescription>
            Opptaket vil ligge under opptak.abakus.no/[slug]/
          </InputDescription>
          <Input
            name="slug"
            value={formik.values.slug}
            onChange={formik.handleChange}
            placeholder="f. eks. komiteer/revy/backup"
            disabled={!isNew}
          />
        </InputWrapper>
      </FormGroup>
      <FormGroup>
        <InputWrapper>
          <InputTitle>Opptaket åpner</InputTitle>
          <InputDescription>
            Fra dette tidspunktet er det mulig å legge inn søknader
          </InputDescription>
          <Input
            name="openTime"
            type="datetime-local"
            value={formik.values.openTime}
            onChange={formik.handleChange}
          />
        </InputWrapper>
        <InputWrapper>
          <InputTitle>Søknadsfrist</InputTitle>
          <InputDescription>
            Etter dette er ikke søkere garantert å bli sett, men de kan fortsatt
            søke og redigere søknaden sin.
          </InputDescription>
          <Input
            name="deadline"
            type="datetime-local"
            value={formik.values.deadline}
            onChange={formik.handleChange}
          />
        </InputWrapper>
        <InputWrapper>
          <InputTitle>Opptaket stenger</InputTitle>
          <InputDescription>
            Etter dette tidspunktet er det ikke mulig å legge inn søknader
          </InputDescription>
          <Input
            name="closeTime"
            type="datetime-local"
            value={formik.values.closeTime}
            onChange={formik.handleChange}
          />
        </InputWrapper>
      </FormGroup>
      <FormGroup>
        <InputWrapper>
          <InputTitle>Admin-grupper</InputTitle>
          <InputDescription>
            Lederne av disse gruppene får tilgang til å se samtlige søkere.
          </InputDescription>
          <GroupSelector
            value={formik.values.adminGroups}
            toggleGroup={(value) => {
              formik.setFieldValue(
                "adminGroups",
                toggleFromArray<Group>(formik.values.adminGroups, value)
              );
            }}
          />
        </InputWrapper>
      </FormGroup>
      <FormGroup>
        <InputWrapper>
          <InputTitle>Grupper som har opptak</InputTitle>
          <InputDescription>
            Ledere og opptaksansvarlige i disse gruppene kan se søknadene til
            sin respektive gruppe.
          </InputDescription>
          <GroupSelector
            value={formik.values.groups}
            toggleGroup={(value) => {
              formik.setFieldValue(
                "groups",
                toggleFromArray<Group>(formik.values.groups, value)
              );
            }}
          />
        </InputWrapper>
      </FormGroup>
      <LegoButton type="submit">Opprett opptak</LegoButton>
    </form>
  );
};

export default CreateAdmission;

const Title = styled.h2`
  margin-top: 0;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 30px;
  margin-bottom: 2rem;
`;

const InputWrapper = styled.div`
  flex-basis: 550px;
`;

const InputTitle = styled.p`
  font-size: 22px;
  line-height: 1.2;
  margin: 0;
`;

const InputDescription = styled.span`
  display: block;
`;

const Input = styled.input`
  font-size: 16px;
  max-width: 100%;
  width: 300px;
  padding: 5px;
  border-radius: 3px;
  border: 1px solid #d6d6d6;
`;
