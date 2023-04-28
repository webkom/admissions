import { useFormik } from "formik";
import { DateTime } from "luxon";
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import LegoButton from "src/components/LegoButton";
import { useAdminAdmission } from "src/query/hooks";
import {
  MutationAdmission,
  useAdminCreateAdmission,
  useAdminUpdateAdmission,
} from "src/query/mutations";
import { HttpError } from "src/utils/callApi";
import { toggleFromArray } from "src/utils/methods";
import styled from "styled-components";
import GroupSelector from "./components/GroupSelector";

interface ReturnedData {
  type: "error" | "success";
  message: string;
}

const formatDateString = (dateString?: string) =>
  formatDate(DateTime.fromISO(dateString ?? ""));
const formatCurrentDate = () => formatDate(DateTime.now());
const formatDate = (date: DateTime) => date.toFormat("yyyy-MM-dd'T'HH:mm:ss");
const localTimeStringToTimezoned = (dateString: string) =>
  DateTime.fromISO(dateString, {
    zone: "local",
  }).toISO({ includeOffset: true });

const CreateAdmission: React.FC = () => {
  const { admissionSlug } = useParams();
  const { data: admission } = useAdminAdmission(
    admissionSlug ?? "",
    admissionSlug !== undefined
  );

  const createAdmission = useAdminCreateAdmission();
  const updateAdmission = useAdminUpdateAdmission();

  const [returnedData, setReturnedData] = useState<ReturnedData>();

  const isNew = !admissionSlug;

  useEffect(() => {
    setReturnedData(undefined);
  }, [admissionSlug]);

  const formik = useFormik<MutationAdmission>({
    initialValues: {
      title: "",
      slug: "",
      description: "",
      open_from: formatCurrentDate(),
      public_deadline: formatCurrentDate(),
      closed_from: formatCurrentDate(),
      groups: [],
    },
    onSubmit: (values) => {
      setReturnedData(undefined);
      const processedValues = { ...values };
      // Use luxon to parse datetime with local timezone and add timezone offset to the datetime-string
      processedValues.open_from =
        localTimeStringToTimezoned(processedValues.open_from) ?? "";
      processedValues.closed_from =
        localTimeStringToTimezoned(processedValues.closed_from) ?? "";
      processedValues.public_deadline =
        localTimeStringToTimezoned(processedValues.public_deadline) ?? "";
      const onSuccess = () => {
        setReturnedData({ type: "success", message: "Opptaket er lagret!" });
      };
      const onError = (error: unknown) => {
        if (error instanceof HttpError) {
          setReturnedData({
            type: "error",
            message:
              "Feilkode " + error?.code + ", klarte ikke lagre opptaket.",
          });
        } else {
          setReturnedData({ type: "error", message: JSON.stringify(error) });
        }
      };
      if (isNew) {
        createAdmission.mutate(
          { admission: processedValues },
          {
            onSuccess,
            onError,
          }
        );
      } else {
        updateAdmission.mutate(
          { slug: admissionSlug ?? "", admission: processedValues },
          {
            onSuccess,
            onError,
          }
        );
      }
    },
  });

  useEffect(() => {
    if (admission) {
      formik.setValues({
        title: admission.title,
        slug: admission.slug,
        description: admission.description,
        open_from: formatDateString(admission.open_from),
        public_deadline: formatDateString(admission.public_deadline),
        closed_from: formatDateString(admission.closed_from),
        groups: admission.groups.map((group) => group.pk),
      });
    }
  }, [admission]);

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
            name="open_from"
            type="datetime-local"
            value={formik.values.open_from}
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
            name="public_deadline"
            type="datetime-local"
            value={formik.values.public_deadline}
            onChange={formik.handleChange}
          />
        </InputWrapper>
        <InputWrapper>
          <InputTitle>Opptaket stenger</InputTitle>
          <InputDescription>
            Etter dette tidspunktet er det ikke mulig å legge inn søknader
          </InputDescription>
          <Input
            name="closed_from"
            type="datetime-local"
            value={formik.values.closed_from}
            onChange={formik.handleChange}
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
                toggleFromArray(formik.values.groups, value)
              );
            }}
          />
        </InputWrapper>
      </FormGroup>
      {returnedData && (
        <FormGroup>
          <ResultText type={returnedData.type}>
            {returnedData.message}
          </ResultText>
        </FormGroup>
      )}
      <LegoButton type="submit">
        {isNew ? "Opprett opptak" : "Oppdater opptak"}
      </LegoButton>
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

const ResultText = styled.span.attrs((props: ReturnedData) => ({
  type: props.type,
}))`
  padding: 0.3rem 1rem;
  border-radius: 10px;
  background: ${({ type }) =>
    type === "success" ? "var(--lego-green)" : "var(--abakus-red-light)"};
`;
