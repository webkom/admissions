import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useParams } from "react-router-dom";
import { useAdmission } from "src/query/hooks";
import LoadingBall from "src/components/LoadingBall";
import JsonFieldRenderer from "src/components/JsonField/Renderer";
import JsonFieldEditor from "src/components/JsonField/Editor";
import { FieldModel } from "src/utils/jsonFields";
import { Formik } from "formik";

export interface CsvData {
  name: string;
  email: string;
  username: string;
  applicationText: string;
  createdAt: string;
  updatedAt: string;
  appliedWithinDeadline: boolean;
  phoneNumber: string;
}

const EditFields = () => {
  const { admissionSlug } = useParams();

  const {
    data: admission,
    isFetching,
    error,
  } = useAdmission(admissionSlug ?? "");

  const [headerFields, setHeaderFields] = useState<FieldModel[]>([]);

  useEffect(() => setHeaderFields(admission?.header_fields ?? []), [admission]);

  if (error) return <div>Error: {error.message}</div>;
  if (isFetching) return <LoadingBall />;
  if (!admission) return null;

  return (
    <PageWrapper>
      <h3>Rediger opptak</h3>
      <span>
        Her kan du legge til ekstra informasjon og spørsmål alle søkere må ta
        stilling til.
      </span>
      <span>
        Svarene på spørsmålene er kun synlige for brukere som kan se alle
        søknader (ledere og opptaksansvarlige i grupper som har opptak har ikke
        tilgang).
      </span>
      <JsonFieldEditor
        admission={admission}
        fields={headerFields}
        setFields={setHeaderFields}
      />
      <h3>Forhåndsvisning</h3>
      <Formik initialValues={{}} onSubmit={(values) => {}}>
        <JsonFieldRenderer fields={headerFields} sectionName="" />
      </Formik>
    </PageWrapper>
  );
};

export default EditFields;

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: 2rem;
`;
