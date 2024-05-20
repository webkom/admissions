import { AxiosError } from "axios";
import { useFormik } from "formik";
import { DateTime } from "luxon";
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ConfirmModal from "src/components/ConfirmModal";
import { useManageAdmission } from "src/query/hooks";
import {
  AdmissionMutationResponse,
  MutationAdmission,
  useManageCreateAdmission,
  useManageDeleteAdmission,
  useManageUpdateAdmission,
} from "src/query/mutations";
import { toggleFromArray } from "src/utils/methods";
import styled from "styled-components";
import GroupSelector from "./components/GroupSelector";
import { Button } from "@webkom/lego-bricks";
import LoadingBall from "src/components/LoadingBall";

interface ReturnedData {
  type: "error" | "success";
  message: string;
}

const formatDateString = (dateString?: string): string =>
  formatDate(DateTime.fromISO(dateString ?? ""));
const formatCurrentDate = (): string => formatDate(DateTime.now());
const formatDate = (date: DateTime): string =>
  date.toFormat("yyyy-MM-dd'T'HH:mm:ss");
const localTimeStringToTimezoned = (dateString: string): string | null =>
  DateTime.fromISO(dateString, {
    zone: "local",
  }).toISO({ includeOffset: true });

const CreateAdmission: React.FC = () => {
  const navigate = useNavigate();
  const { admissionSlug } = useParams();
  const {
    data: admission,
    isLoading,
    error,
  } = useManageAdmission(admissionSlug ?? "", admissionSlug !== undefined);

  const createAdmission = useManageCreateAdmission();
  const updateAdmission = useManageUpdateAdmission();
  const deleteAdmission = useManageDeleteAdmission();

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
      header_fields: [],
      open_from: formatCurrentDate(),
      public_deadline: formatCurrentDate(),
      closed_from: formatCurrentDate(),
      admin_groups: [],
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
      const onSuccess = (data: AdmissionMutationResponse) => {
        setReturnedData({ type: "success", message: "Opptaket er lagret!" });
        if (data?.slug) {
          navigate("/manage/" + data.slug);
        }
      };
      const onError = (error: AxiosError) => {
        console.error(error.response?.data);
        setReturnedData({
          type: "error",
          message:
            "Feilkode " +
            error.response?.status +
            ", klarte ikke lagre opptaket.",
        });
      };
      if (isNew) {
        createAdmission.mutate(
          { admission: processedValues },
          {
            onSuccess,
            onError,
          },
        );
      } else {
        updateAdmission.mutate(
          { slug: admissionSlug ?? "", admission: processedValues },
          {
            onSuccess,
            onError,
          },
        );
      }
    },
  });

  const handleDeleteAdmission = () => {
    if (!admission) return;
    deleteAdmission.mutate(
      { slug: admission.slug },
      {
        onSuccess: () => {
          navigate("/manage/");
        },
      },
    );
  };

  useEffect(() => {
    if (admission) {
      formik.setValues({
        title: admission.title,
        slug: admission.slug,
        description: admission.description,
        header_fields: admission.header_fields,
        open_from: formatDateString(admission.open_from),
        public_deadline: formatDateString(admission.public_deadline),
        closed_from: formatDateString(admission.closed_from),
        admin_groups: admission.admin_groups?.map((group) => group.pk) ?? [],
        groups: admission.groups.map((group) => group.pk),
      });
    }
  }, [admission]);

  if (!isNew && isLoading) {
    return <LoadingBall />;
  }

  if ((!isNew && !admission && !isLoading) || error?.response?.status === 404) {
    return <p>Fant ikke opptaket {admissionSlug}</p>;
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
            Opptaket vil ligge under opptak.abakus.no/
            {formik.values.slug || "[slug]"}/
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
          <InputTitle>Admin-grupper</InputTitle>
          <InputDescription>
            Medlemmene av disse gruppene får tilgang til å se samtlige søkere.
          </InputDescription>
          <GroupSelector
            value={formik.values.admin_groups}
            toggleGroup={(value) => {
              formik.setFieldValue(
                "admin_groups",
                toggleFromArray(formik.values.admin_groups, value),
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
                toggleFromArray(formik.values.groups, value),
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
      <FormGroup>
        <InputWrapper>
          <Button type="submit" disabled={!formik.isValid} success>
            {isNew ? "Opprett opptak" : "Lagre endringer"}
          </Button>
        </InputWrapper>
        {!isNew && (
          <InputWrapper>
            <ConfirmModal
              title="Slett opptak"
              trigger={({ onClick }) => (
                <Button
                  disabled={
                    DateTime.fromISO(admission?.closed_from ?? "")
                      .diffNow()
                      .valueOf() > 0
                  }
                  onClick={onClick}
                  danger
                >
                  Slett opptak
                </Button>
              )}
              message="Er du sikker på at du vil slette opptaket?"
              cancelText="Nei"
              onConfirm={handleDeleteAdmission}
            />
            <InputDescription>
              Opptaket kan kun slettes etter det har stengt
            </InputDescription>
          </InputWrapper>
        )}
      </FormGroup>
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
  color: var(--color-gray-6);
  line-height: 1.5;
  margin-bottom: 0.5em;
`;

const Input = styled.input`
  font-size: 16px;
  max-width: 100%;
  width: 300px;
  padding: 5px;
  border-radius: 3px;
  border: 1px solid #d6d6d6;
`;

const ResultText = styled.span<{ type: ReturnedData["type"] }>`
  padding: 0.3rem 1rem;
  border-radius: 10px;
  background: ${({ type }) =>
    type === "success" ? "var(--color-green-7)" : "var(--lego-red-color)"};
`;
