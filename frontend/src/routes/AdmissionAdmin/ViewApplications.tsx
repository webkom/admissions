import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import FormatTime from "src/components/Time/FormatTime";

import LoadingBall from "src/components/LoadingBall";
import GroupStatistics from "./components/GroupStatistics";
import { replaceQuotationMarks } from "src/utils/methods";
import { useAdmission, useAdminApplications } from "src/query/hooks";
import { useParams } from "react-router-dom";

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

const ViewApplications = () => {
  const { admissionSlug } = useParams();
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
  const availableGroups = (groups ?? []).filter(
    (group) =>
      admission?.userdata.is_admin ||
      group.name === djangoData.user.representative_of_group,
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
      sortedApplications.filter(
        (application) =>
          selectedGroups.length === 0 ||
          application.group_applications.find((groupApplication) =>
            selectedGroups.includes(groupApplication.group.name),
          ),
      ),
    [selectedGroups, sortedApplications],
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
            {[...availableGroups]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((group) => (
                <GroupStatistics
                  key={group.pk}
                  applications={sortedApplications}
                  groupName={group.name}
                  groupLogo={group.logo}
                  selectedGroups={selectedGroups}
                  setSelectedGroups={setSelectedGroups}
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
