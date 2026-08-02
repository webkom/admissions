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
import AdmissionDateTimePicker from "./components/AdmissionDateTimePicker";
import GroupSelector from "./components/GroupSelector";
import { Button } from "@webkom/lego-bricks";
import LoadingBall from "src/components/LoadingBall";
import {
  createDefaultAdmissionDates,
  getAdmissionDateTimeIssue,
  resolveAdmissionDateTime,
  serializeAdmissionDateTime,
  toAdmissionLocalDateTime,
} from "./admissionDateDefaults";

interface ReturnedData {
  type: "error" | "success";
  message: string;
}

const admissionDateFields = [
  "open_from",
  "public_deadline",
  "closed_from",
] as const;
type AdmissionDateField = (typeof admissionDateFields)[number];
type PreservedAdmissionDates = Partial<Record<AdmissionDateField, string>>;

const validateAdmissionDates = (
  values: MutationAdmission,
  preservedDates: PreservedAdmissionDates = {},
): Partial<Record<AdmissionDateField, string>> => {
  const errors: Partial<Record<AdmissionDateField, string>> = {};
  const resolvedDates: Partial<Record<AdmissionDateField, DateTime>> = {};
  const labels: Record<AdmissionDateField, string> = {
    open_from: "Åpningstidspunkt",
    public_deadline: "Søknadsfrist",
    closed_from: "Stengetidspunkt",
  };
  admissionDateFields.forEach((field) => {
    if (!values[field]) {
      errors[field] = `${labels[field]} er påkrevd`;
      return;
    }
    const dateTimeIssue = getAdmissionDateTimeIssue(values[field]);
    const resolvedDate = resolveAdmissionDateTime(
      values[field],
      preservedDates[field],
    );
    if (dateTimeIssue === "ambiguous" && !resolvedDate) {
      errors[field] =
        "Klokkeslettet er tvetydig ved overgang til vintertid. Velg et annet klokkeslett";
    } else if (!resolvedDate) {
      errors[field] =
        "Velg en gyldig dato og et gyldig klokkeslett i norsk tid";
    } else {
      resolvedDates[field] = resolvedDate;
    }
  });
  const opening = resolvedDates.open_from;
  const deadline = resolvedDates.public_deadline;
  const closing = resolvedDates.closed_from;
  if (opening && deadline && deadline.toMillis() <= opening.toMillis()) {
    errors.public_deadline = "Søknadsfristen må være etter åpningen";
  }
  if (deadline && closing && closing.toMillis() < deadline.toMillis()) {
    errors.closed_from = "Stengingen kan ikke være før søknadsfristen";
  }
  return errors;
};

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
  const preservedAdmissionDates: PreservedAdmissionDates = {
    open_from: admission?.open_from,
    public_deadline: admission?.public_deadline,
    closed_from: admission?.closed_from,
  };

  useEffect(() => {
    setReturnedData(undefined);
  }, [admissionSlug]);

  const formik = useFormik<MutationAdmission>({
    initialValues: {
      title: "",
      slug: "",
      description: "",
      ...createDefaultAdmissionDates(),
      admin_groups: [],
      groups: [],
    },
    onSubmit: (values) => {
      const dateErrors = validateAdmissionDates(
        values,
        preservedAdmissionDates,
      );
      if (Object.keys(dateErrors).length > 0) {
        Object.keys(dateErrors).forEach((field) => {
          void formik.setFieldTouched(field, true, false);
        });
        return;
      }
      setReturnedData(undefined);
      const processedValues = { ...values };
      admissionDateFields.forEach((field) => {
        processedValues[field] =
          serializeAdmissionDateTime(
            processedValues[field],
            preservedAdmissionDates[field],
          ) ?? "";
      });
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
        open_from: toAdmissionLocalDateTime(admission.open_from),
        public_deadline: toAdmissionLocalDateTime(admission.public_deadline),
        closed_from: toAdmissionLocalDateTime(admission.closed_from),
        admin_groups: admission.admin_groups?.map((group) => group.pk) ?? [],
        groups: admission.groups.map((group) => group.pk),
      });
    }
  }, [admission]);

  const dateErrors = validateAdmissionDates(
    formik.values,
    preservedAdmissionDates,
  );
  const dateFieldError = (field: AdmissionDateField) => dateErrors[field];

  const updateDateField = (field: AdmissionDateField, value: string) => {
    void formik.setValues(
      (currentValues) => ({ ...currentValues, [field]: value }),
      false,
    );
  };

  const touchDateField = (field: AdmissionDateField) =>
    formik.setFieldTouched(field, true, false);

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
      <InputDescription id="admission-timezone-description">
        Alle tidspunkt vises og tolkes i norsk tid (Europe/Oslo).
      </InputDescription>
      <FormGroup>
        <InputWrapper>
          <InputTitle>Opptaket åpner</InputTitle>
          <InputDescription id="open-from-description">
            Fra dette tidspunktet er det mulig å legge inn søknader
          </InputDescription>
          <AdmissionDateTimePicker
            id="open_from"
            label="Opptaket åpner"
            value={formik.values.open_from}
            preservedValue={preservedAdmissionDates.open_from}
            invalid={Boolean(dateFieldError("open_from"))}
            error={dateFieldError("open_from")}
            describedBy="open-from-description admission-timezone-description"
            onChange={(value) => updateDateField("open_from", value)}
            onBlur={() => void touchDateField("open_from")}
          />
        </InputWrapper>
        <InputWrapper>
          <InputTitle>Søknadsfrist</InputTitle>
          <InputDescription id="public-deadline-description">
            Etter dette er ikke søkere garantert å bli sett, men de kan fortsatt
            søke og redigere søknaden sin.
          </InputDescription>
          <AdmissionDateTimePicker
            id="public_deadline"
            label="Søknadsfrist"
            value={formik.values.public_deadline}
            min={formik.values.open_from || undefined}
            preservedValue={preservedAdmissionDates.public_deadline}
            preservedMin={preservedAdmissionDates.open_from}
            minExclusive
            invalid={Boolean(dateFieldError("public_deadline"))}
            error={dateFieldError("public_deadline")}
            describedBy="public-deadline-description admission-timezone-description"
            onChange={(value) => updateDateField("public_deadline", value)}
            onBlur={() => void touchDateField("public_deadline")}
          />
        </InputWrapper>
        <InputWrapper>
          <InputTitle>Opptaket stenger</InputTitle>
          <InputDescription id="closed-from-description">
            Etter dette tidspunktet er det ikke mulig å legge inn søknader
          </InputDescription>
          <AdmissionDateTimePicker
            id="closed_from"
            label="Opptaket stenger"
            value={formik.values.closed_from}
            min={formik.values.public_deadline || undefined}
            preservedValue={preservedAdmissionDates.closed_from}
            preservedMin={preservedAdmissionDates.public_deadline}
            invalid={Boolean(dateFieldError("closed_from"))}
            error={dateFieldError("closed_from")}
            describedBy="closed-from-description admission-timezone-description"
            onChange={(value) => updateDateField("closed_from", value)}
            onBlur={() => void touchDateField("closed_from")}
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
          <Button
            type="submit"
            disabled={!formik.isValid || Object.keys(dateErrors).length > 0}
            success
          >
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
