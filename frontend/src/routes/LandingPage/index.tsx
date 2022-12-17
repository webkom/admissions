import React from "react";
import { useAdmissions } from "src/query/hooks";
import LoadingBall from "src/components/LoadingBall";
import Admission from "./Admission";
import LandingPageSkeleton from "./LandingPageSkeleton";
import LandingPageNoAdmission from "./LandingPageNoAdmission";

const LandingPage = () => {
  const {
    data: admissions,
    error: admissionError,
    isFetching: admissionIsFetching,
  } = useAdmissions();

  if (admissionError) {
    return <div>Error: {admissionError.message}</div>;
  }

  if (admissionIsFetching) {
    return <LoadingBall />;
  }

  if (!admissions || admissions.length === 0) {
    return <LandingPageNoAdmission />;
  }

  return (
    <LandingPageSkeleton>
      {admissions.map((admission) => (
        <Admission key={admission.pk} admission={admission} />
      ))}
    </LandingPageSkeleton>
  );
};

export default LandingPage;
