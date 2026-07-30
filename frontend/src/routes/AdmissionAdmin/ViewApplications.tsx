import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import FormatTime from "src/components/Time/FormatTime";

import LoadingBall from "src/components/LoadingBall";
import GroupStatistics from "./components/GroupStatistics";
import { replaceQuotationMarks } from "src/utils/methods";
import { useAdmission, useAdminApplications } from "src/query/hooks";
import { useParams, useSearchParams } from "react-router-dom";

import AdmissionsContainer from "src/containers/AdmissionsContainer";
import { Application } from "src/types";
import {
  Statistics,
  StatisticsName,
  StatisticsWrapper,
} from "./components/StyledElements";
import djangoData from "src/utils/djangoData";
import { InputFieldModel } from "src/utils/jsonFields";
import CSVExportHandler, {
  CompleteCsvData,
} from "./components/CSVExportHandler";
import { getAdmissionAccessProjection } from "src/utils/admissionAccess";

const ViewApplications = () => {
  const { admissionSlug } = useParams();
  const [searchParams] = useSearchParams();
  const [sortedApplications, setSortedApplications] = useState<Application[]>(
    [],
  );
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  const {
    data: applications,
    error: applicationsError,
    isFetching: applicationsIsFetching,
  } = useAdminApplications(admissionSlug ?? "");
  const {
    data: admission,
    error: admissionError,
    isFetching: admissionIsFetching,
  } = useAdmission(admissionSlug ?? "");
  const { groups } = admission ?? {};
  const accessProjection = admission
    ? getAdmissionAccessProjection(admission.userdata)
    : null;
  const hasAccessProjection = Boolean(
    admission &&
      (admission.userdata.group_contexts !== undefined ||
        admission.userdata.admission_actions !== undefined),
  );
  const canAdministerAllApplications = Boolean(
    admission &&
      (accessProjection?.admissionActions.administer_all_applications ||
        (!hasAccessProjection && admission.userdata.is_admin)),
  );
  const representedGroupIds = new Set(
    accessProjection?.groupContexts
      .filter((context) => context.actions.administer_group_applications)
      .map((context) => context.group.id) ?? [],
  );
  const availableGroups = (groups ?? []).filter(
    (group) =>
      canAdministerAllApplications ||
      representedGroupIds.has(String(group.pk)) ||
      (!hasAccessProjection &&
        group.name === djangoData.user.representative_of_group),
  );
  const requestedGroupId = searchParams.get("group");
  const scopedGroup = requestedGroupId
    ? availableGroups.find((group) => String(group.pk) === requestedGroupId)
    : undefined;
  const hasInvalidGroupScope = Boolean(requestedGroupId && !scopedGroup);
  const effectiveSelectedGroups = useMemo(
    () => (scopedGroup ? [scopedGroup.name] : selectedGroups),
    [scopedGroup, selectedGroups],
  );
  const groupQuestionFields = availableGroups.flatMap((group) =>
    (group.header_fields ?? [])
      .filter((field): field is InputFieldModel => "id" in field)
      .map((field) => ({
        groupId: String(group.pk),
        groupName: group.name,
        field,
      })),
  );

  const csvHeaders = [
    { label: "Fullt Navn", key: "name" },
    { label: "Prioriteringer", key: "priorityText" },
    ...groupQuestionFields.map(({ groupId, groupName, field }) => ({
      label: `${groupName}: ${field.title}`,
      key: `groupAnswer.${groupId}.${field.id}`,
    })),
    { label: "Gruppe", key: "group" },
    { label: "Søknadstekst", key: "groupApplicationText" },
    { label: "E-post", key: "email" },
    { label: "Mobilnummer", key: "phoneNumber" },
    { label: "Brukernavn", key: "username" },
    { label: "Søkt innen frist", key: "appliedWithinDeadline" },
    { label: "Tid sendt", key: "createdAt" },
    { label: "Tid oppdatert", key: "updatedAt" },
  ];

  useEffect(() => {
    if (!applications) return;
    setSortedApplications(
      [...applications].sort((a, b) =>
        a.user.full_name.localeCompare(b.user.full_name),
      ),
    );
  }, [applications]);

  const filteredApplications = useMemo(
    () =>
      sortedApplications
        .filter(
          (application) =>
            effectiveSelectedGroups.length === 0 ||
            application.group_applications.find((groupApplication) =>
              effectiveSelectedGroups.includes(groupApplication.group.name),
            ),
        )
        .map((application) =>
          scopedGroup
            ? {
                ...application,
                group_applications: application.group_applications.filter(
                  (groupApplication) =>
                    String(groupApplication.group.pk) ===
                    String(scopedGroup.pk),
                ),
              }
            : application,
        ),
    [effectiveSelectedGroups, scopedGroup, sortedApplications],
  );

  const csvData = useMemo(() => {
    // Push all the individual applications into csvData with the right format
    const updatedCsvData: CompleteCsvData[] = [];
    filteredApplications.forEach((application) => {
      application.group_applications.forEach((groupApplication) => {
        const groupId = String(groupApplication.group.pk);
        const groupAnswerCsvValues = Object.fromEntries(
          groupQuestionFields
            .filter((entry) => entry.groupId === groupId)
            .map(({ field }) => {
              const response =
                groupApplication.header_fields_response?.[field.id];
              return [
                `groupAnswer.${groupId}.${field.id}`,
                typeof response === "boolean"
                  ? response
                    ? "Ja"
                    : "Nei"
                  : (response ?? ""),
              ];
            }),
        );
        updatedCsvData.push({
          name: application.user.full_name,
          priorityText:
            application.priority_text !== ""
              ? replaceQuotationMarks(application.priority_text ?? "")
              : "Ingen prioriteringer",
          ...groupAnswerCsvValues,
          group: groupApplication.group.name,
          groupApplicationText: replaceQuotationMarks(groupApplication.text),
          email: application.user.email,
          phoneNumber: application.phone_number,
          username: application.user.username,
          appliedWithinDeadline: application.applied_within_deadline,
          createdAt: application.created_at,
          updatedAt: application.updated_at,
        });
      });
    });
    return updatedCsvData;
  }, [filteredApplications, groupQuestionFields]);

  const numApplicants = filteredApplications.length;

  let numApplications = 0;
  filteredApplications.forEach((application) => {
    numApplications += application.group_applications.length;
  });

  if (applicationsError || admissionError) {
    return (
      <div>
        Error: {applicationsError?.message}
        {admissionError?.message}
      </div>
    );
  } else if (applicationsIsFetching || admissionIsFetching) {
    return <LoadingBall />;
  } else if (!admission) {
    return <p>Opptak {admissionSlug} ble ikke funnet i systemet.</p>;
  } else if (hasInvalidGroupScope) {
    return (
      <p>
        Du har ikke tilgang til denne komitévisningen. Velg komiteen fra
        opptakets startside.
      </p>
    );
  } else {
    return (
      <PageWrapper>
        <Statistics>
          <StatisticsWrapper>
            <StatisticsName>Søknader åpner</StatisticsName>
            <FormatTime format="HH:mm:ss EEEE d. MMMM">
              {admission.open_from}
            </FormatTime>
          </StatisticsWrapper>
          <StatisticsWrapper>
            <StatisticsName>Søknadsfrist</StatisticsName>
            <FormatTime format="HH:mm:ss EEEE d. MMMM">
              {admission.public_deadline}
            </FormatTime>
          </StatisticsWrapper>
          <StatisticsWrapper>
            <StatisticsName>Redigeringsfrist</StatisticsName>
            <FormatTime format="HH:mm:ss EEEE d. MMMM">
              {admission.closed_from}
            </FormatTime>
          </StatisticsWrapper>
        </Statistics>
        <Statistics>
          <StatisticsWrapper $smallerMargin>
            <StatisticsName>Antall søkere</StatisticsName>
            {numApplicants} {numApplicants == 1 ? "søker" : "søkere"}
          </StatisticsWrapper>
          <StatisticsWrapper $smallerMargin>
            <StatisticsName>Totalt antall søknader</StatisticsName>
            {numApplications} {numApplications == 1 ? "søknad" : "søknader"}
          </StatisticsWrapper>

          <Statistics>
            {availableGroups
              .filter((group) => !scopedGroup || group.pk === scopedGroup.pk)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((group) => (
                <GroupStatistics
                  key={group.pk}
                  applications={filteredApplications}
                  groupName={group.name}
                  groupLogo={group.logo}
                  selectedGroups={effectiveSelectedGroups}
                  setSelectedGroups={
                    scopedGroup ? () => undefined : setSelectedGroups
                  }
                />
              ))}
          </Statistics>
        </Statistics>
        <CSVExportHandler csvData={csvData} csvHeaders={csvHeaders} />
        <AdmissionsContainer
          admission={admission}
          applications={filteredApplications}
        />
      </PageWrapper>
    );
  }
};

export default ViewApplications;

/** Styles **/

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 1em;
  border: 1px solid rgba(0, 0, 0, 0.09);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
`;
