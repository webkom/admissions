import React, {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import styled from "styled-components";

import {
  createDraftAdmissionScope,
  getSelectedGroupsDraft,
  saveSubmittedPhoneNumber,
  saveSelectedGroupsDraft,
  setDraftAdmissionScope,
} from "src/utils/draftHelper";
import djangoData, { isLoggedIn } from "src/utils/djangoData";

import { useAdmission, useMyApplication } from "src/query/hooks";
import SessionExpiredNotice from "./ApplicationForm/SessionExpiredNotice";
import SessionExpiryWarning from "src/components/SessionExpiryWarning";

import LoadingBall from "src/components/LoadingBall";
import NavBar from "src/components/NavBar";
import NotFoundPage from "./NotFoundPage";
import RequireAuth from "src/components/RequireAuth";

const ApplicationForm = React.lazy(() => import("src/routes/ApplicationForm"));
const ReceiptForm = React.lazy(() => import("src/routes/ReceiptForm"));
const GroupsPage = React.lazy(() => import("src/routes/GroupsPage"));
const AdmissionAdmin = React.lazy(() => import("src/routes/AdmissionAdmin"));
const SchedulePage = React.lazy(() => import("./SchedulePage"));

interface SelectedGroups {
  [key: string]: boolean;
}

const ApplicationPortal = () => {
  const { admissionSlug, "*": portalPath } = useParams();
  const userId = djangoData.user.id ?? "";
  const draftScope = createDraftAdmissionScope(admissionSlug ?? "", userId);

  const [selectedGroups, setSelectedGroups] = useState<SelectedGroups>(
    () => getSelectedGroupsDraft(draftScope) ?? {},
  );
  const [isEditingApplication, setIsEditingApplication] = useState<
    boolean | null
  >(null);
  const [activeDraftScope, setActiveDraftScope] = useState<string | null>(null);

  useLayoutEffect(() => {
    setDraftAdmissionScope(admissionSlug ?? "", userId);
    setSelectedGroups(getSelectedGroupsDraft(draftScope) ?? {});
    setIsEditingApplication(null);
    setActiveDraftScope(draftScope);
  }, [admissionSlug, draftScope, userId]);

  const { data: myApplication, isFetched: applicationSettled } =
    useMyApplication(admissionSlug ?? "");
  const {
    data: admission,
    isLoading,
    error,
  } = useAdmission(admissionSlug ?? "");
  const { groups } = admission ?? {};
  const isMember = (admission?.userdata.committee_groups?.length ?? 0) > 0;
  const isPrivileged = !!admission?.userdata.is_privileged;
  const isScheduleRoute = portalPath?.replace(/^\/+/, "") === "schedule";
  const isScheduleAccessFailure =
    isScheduleRoute && [401, 403].includes(error?.response?.status ?? 0);

  const isSingleGroupAdmission = admission?.groups.length === 1;

  // A one-committee admission has exactly one meaningful selection, so derive
  // it rather than storing it. The previous effect re-wrote state on every
  // admission refetch — and useAdmission polls every 15s — which discarded the
  // rest of the map and raced the hydration below.
  const effectiveSelectedGroups: SelectedGroups = useMemo(
    () =>
      isSingleGroupAdmission && admission
        ? { [admission.groups[0].name.toLowerCase()]: true }
        : selectedGroups,
    [admission, isSingleGroupAdmission, selectedGroups],
  );

  const toggleGroup = (name: string) => {
    if (isSingleGroupAdmission) return;
    const next = {
      ...selectedGroups,
      [name.toLowerCase()]: !selectedGroups[name.toLowerCase()],
    };
    setSelectedGroups(next);
    // Written here rather than from an effect: storage should reflect a user
    // action, never a render.
    saveSelectedGroupsDraft(next);
  };

  const toggleIsEditing = () => {
    setIsEditingApplication((editing) => !editing);
  };

  useEffect(() => {
    if (!myApplication?.phone_number) return;
    saveSubmittedPhoneNumber(userId, myApplication.phone_number);
  }, [myApplication?.phone_number, userId]);

  // Hydrate the selection from the server exactly once per application, and
  // only when the applicant has no draft of their own. Keyed on pk because it
  // is stable across polls, refetches and reconnects, but changes if the
  // application is deleted and recreated — which is when re-hydrating is right.
  const hydratedForPk = useRef<string | null>(null);
  useEffect(() => {
    const pk = myApplication?.pk;
    if (!pk || hydratedForPk.current === pk) return;
    hydratedForPk.current = pk;
    if (getSelectedGroupsDraft() !== null) return;
    setSelectedGroups(
      (myApplication?.group_applications ?? []).reduce(
        (obj, application) => ({
          ...obj,
          [application.group.name.toLowerCase()]: true,
        }),
        {} as SelectedGroups,
      ),
    );
  }, [myApplication]);

  // Resolve the landing view once, from this query's own settled state. The
  // previous version gated on useAdmission's isLoading while reading
  // useMyApplication's data, so whichever resolved first decided the view.
  useEffect(() => {
    if (isEditingApplication !== null || !applicationSettled) return;
    setIsEditingApplication(!myApplication);
  }, [applicationSettled, isEditingApplication, myApplication]);

  if (!isLoggedIn()) {
    return null;
  } else if (error) {
    if (error.response?.status === 404) {
      return <NotFoundPage />;
    }
    if (isScheduleAccessFailure) {
      return (
        <PageWrapper>
          <NavBar isEditing={false} />
          <ContentContainer>
            <Suspense fallback={<LoadingBall />}>
              <SchedulePage />
            </Suspense>
          </ContentContainer>
        </PageWrapper>
      );
    }
    return <SessionExpiredNotice error={error} />;
  } else if (isLoading || activeDraftScope !== draftScope) {
    return <LoadingBall />;
  } else {
    return (
      <PageWrapper>
        <SessionExpiryWarning />
        <NavBar isEditing={!!isEditingApplication} />
        <ContentContainer>
          <Suspense fallback={<LoadingBall />}>
            <Routes>
              <Route
                path="/velg-grupper"
                element={
                  // Nothing to choose in a one-committee admission, and the
                  // page's only control would be inert. NavBar already hides
                  // the link; this makes the hiding real for typed URLs.
                  isSingleGroupAdmission ? (
                    <Navigate to={`/${admissionSlug}/min-soknad`} replace />
                  ) : (
                    <GroupsPage
                      toggleGroup={toggleGroup}
                      selectedGroups={effectiveSelectedGroups}
                    />
                  )
                }
              />
              <Route
                path="/min-soknad"
                element={
                  myApplication && !isEditingApplication ? (
                    <ReceiptForm toggleIsEditing={toggleIsEditing} />
                  ) : (
                    <ApplicationForm
                      toggleGroup={toggleGroup}
                      toggleIsEditing={toggleIsEditing}
                      admission={admission}
                      groups={groups ?? []}
                      myApplication={myApplication}
                      selectedGroups={effectiveSelectedGroups}
                    />
                  )
                }
              />
              <Route
                path="/admin/*"
                element={
                  <RequireAuth auth={isPrivileged}>
                    <AdmissionAdmin />
                  </RequireAuth>
                }
              />
              <Route
                path="/schedule"
                element={
                  <RequireAuth auth={isMember || isPrivileged}>
                    <SchedulePage />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ContentContainer>
      </PageWrapper>
    );
  }
};

export default ApplicationPortal;

const ContentContainer = styled.div`
  width: 100%;
`;

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: var(--page-min-height);
`;
