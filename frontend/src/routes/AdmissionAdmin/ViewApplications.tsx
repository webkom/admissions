import React, { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { EyeOff, FileDown, Search } from "lucide-react";

import { StyledButton } from "src/components/LinkButton";
import LoadingBall from "src/components/LoadingBall";
import AdmissionsContainer from "src/containers/AdmissionsContainer";
import { useAdmission, useAdminApplications } from "src/query/hooks";
import {
  getApplicationScopeKey,
  isCommitteeMinimalView,
} from "src/utils/applicationAccess";
import { CustomSelect, MultiSelect } from "src/components/ui";
import {
  actionButtonBase,
  actionButtonNeutral,
} from "src/components/Scheduling/ui";
import { interviewStatusOptions } from "src/utils/interviewStatus";
import cn from "src/utils/cn";
import { iconSizes } from "src/styles/designTokens";
import { getApiErrorMessage } from "src/utils/apiErrors";
import type { Group } from "src/types";

import { useApplicationScope } from "./useApplicationScope";
import { useApplicationFilters } from "./useApplicationFilters";
import { useApplicationsCsvExport } from "./useApplicationsCsvExport";
import CandidatePrivacyPreview from "./components/CandidatePrivacyPreview";
import CSVExportHandler from "./components/CSVExportHandler";
import TerminateCommitteeZone from "./components/TerminateCommitteeZone";
import {
  PageWrapper,
  ErrorState,
  Header,
  Title,
  ResultMeta,
  HeaderControls,
  FilterSection,
  SearchField,
  FilterControl,
  ResetFilters,
  EmptyResults,
} from "./ViewApplications.styles";

const filterSelectionSummary = (selected: { label: string }[]): string => {
  if (selected.length === 0) return "Alle";
  if (selected.length === 1)
    return selected[0].label.replace(/\s*\(\d+\)$/, "");
  return `${selected.length} valgt`;
};

const resolveTerminationGroup = (
  availableGroups: Group[],
  scopedGroup: Group | undefined,
  selectedGroupIds: string[],
): Group | undefined => {
  if (scopedGroup) return scopedGroup;
  if (availableGroups.length === 1) return availableGroups[0];
  if (selectedGroupIds.length === 1) {
    return availableGroups.find((group) => group.pk === selectedGroupIds[0]);
  }
  return undefined;
};

const ViewApplications = () => {
  const { admissionSlug } = useParams();
  const [showCandidates, setShowCandidates] = useState(false);
  const [showCsvExport, setShowCsvExport] = useState(false);

  const {
    data: admission,
    error: admissionError,
    isLoading: admissionIsLoading,
    refetch: refetchAdmission,
  } = useAdmission(admissionSlug ?? "");
  const applicationScopeKey = getApplicationScopeKey(admission);
  const applicationViewMode = admission?.userdata.application_view_mode;
  const isCommitteeMinimal = isCommitteeMinimalView(applicationViewMode);

  const {
    data: applications,
    error: applicationsError,
    isLoading: applicationsIsLoading,
    refetch: refetchApplications,
  } = useAdminApplications(
    admissionSlug ?? "",
    applicationScopeKey,
    applicationViewMode,
    admission?.userdata.represented_groups ?? [],
  );

  const { availableGroups, scopedGroup } = useApplicationScope(
    admission,
    isCommitteeMinimal,
  );

  const sortedApplications = useMemo(
    () =>
      [...(applications ?? [])].sort((a, b) =>
        a.user.full_name.localeCompare(b.user.full_name, "nb"),
      ),
    [applications],
  );

  const {
    searchTerm,
    setSearchTerm,
    selectedInterviewStatus,
    setSelectedInterviewStatus,
    selectedGroupIds,
    setSelectedGroupIds,
    filteredApplications,
    groupApplicationCounts,
    activeGroupIds,
    filtersAreActive,
    resetFilters,
  } = useApplicationFilters({
    sortedApplications,
    availableGroups,
    scopedGroup,
  });

  const { showGroupColumn, csvHeaders, exportCsvData, exportFilename } =
    useApplicationsCsvExport({
      filteredApplications,
      admission,
      isCommitteeMinimal,
      activeGroupIds,
      availableGroups,
    });

  const showGroupFilter = !scopedGroup && availableGroups.length > 1;
  const terminationGroup = useMemo(
    () =>
      resolveTerminationGroup(availableGroups, scopedGroup, selectedGroupIds),
    [availableGroups, scopedGroup, selectedGroupIds],
  );

  const revealCandidates = () => setShowCandidates(true);
  const hideCandidates = () => {
    setShowCandidates(false);
    setShowCsvExport(false);
  };

  if (applicationsError || admissionError) {
    const requestError = applicationsError ?? admissionError;
    return (
      <ErrorState role="alert">
        <h2>Kunne ikke laste søknadene</h2>
        <p>
          {requestError
            ? getApiErrorMessage(requestError, "Prøv å laste siden på nytt.")
            : "Prøv å laste siden på nytt."}
        </p>
        <StyledButton
          type="button"
          onClick={() => {
            void refetchApplications();
            void refetchAdmission();
          }}
        >
          Prøv igjen
        </StyledButton>
      </ErrorState>
    );
  }
  if (applicationsIsLoading || admissionIsLoading) {
    return <LoadingBall />;
  }
  if (!admission) {
    return <p>Opptak {admissionSlug} ble ikke funnet i systemet.</p>;
  }

  return (
    <PageWrapper>
      <Header>
        <div>
          <Title>Søknader</Title>
        </div>
        {showCandidates && (
          <HeaderControls>
            <button
              type="button"
              aria-expanded={showCsvExport}
              onClick={() => setShowCsvExport((current) => !current)}
              className={cn(actionButtonBase, actionButtonNeutral, "px-3 py-2")}
            >
              <FileDown size={iconSizes.control} aria-hidden="true" />
              Eksporter CSV
            </button>
            <button
              type="button"
              aria-pressed={showCandidates}
              onClick={hideCandidates}
              className={cn(actionButtonBase, actionButtonNeutral, "px-3 py-2")}
            >
              <EyeOff size={iconSizes.control} aria-hidden="true" />
              Skjul kandidatdata
            </button>
          </HeaderControls>
        )}
      </Header>

      {showCandidates ? (
        <>
          <FilterSection aria-label="Søk og filtrer søknader">
            <ResultMeta aria-live="polite">
              Viser {filteredApplications.length} av {sortedApplications.length}{" "}
              {sortedApplications.length === 1 ? "søker" : "søkere"}
            </ResultMeta>
            <SearchField>
              <Search size={iconSizes.control} aria-hidden="true" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Søk etter navn, brukernavn, e-post eller telefon"
                aria-label="Søk etter navn, brukernavn, e-post eller telefon"
              />
            </SearchField>
            <FilterControl>
              <span>Status</span>
              <CustomSelect
                value={selectedInterviewStatus}
                onChange={setSelectedInterviewStatus}
                options={[
                  { value: "", label: "Alle" },
                  ...interviewStatusOptions,
                ]}
                aria-label="Filtrer på intervjustatus"
              />
            </FilterControl>
            {showGroupFilter && (
              <FilterControl>
                <span>Gruppe</span>
                <MultiSelect
                  values={selectedGroupIds}
                  onChange={setSelectedGroupIds}
                  options={availableGroups.map((group) => ({
                    value: group.pk,
                    label: `${group.name} (${groupApplicationCounts[group.pk] ?? 0})`,
                  }))}
                  getSelectionLabel={filterSelectionSummary}
                  clearAllLabel="Alle grupper"
                  aria-label="Filtrer på gruppe"
                />
              </FilterControl>
            )}
            {filtersAreActive && (
              <ResetFilters
                type="button"
                onClick={resetFilters}
                aria-label="Nullstill søk og filtre"
              >
                Nullstill
              </ResetFilters>
            )}
          </FilterSection>
          {showCsvExport && (
            <CSVExportHandler
              csvData={exportCsvData}
              csvHeaders={csvHeaders}
              filename={exportFilename}
            />
          )}
        </>
      ) : (
        <CandidatePrivacyPreview onReveal={revealCandidates} />
      )}
      {showCandidates && filteredApplications.length > 0 && (
        <AdmissionsContainer
          admission={admission}
          applications={filteredApplications}
          showGroupColumn={showGroupColumn}
          applicationScopeKey={applicationScopeKey}
        />
      )}
      {showCandidates && filteredApplications.length === 0 && (
        <EmptyResults>
          <strong>Ingen søkere samsvarer med filtrene.</strong>
          <span>Prøv et annet søk eller nullstill filtrene.</span>
          {filtersAreActive && (
            <button type="button" onClick={resetFilters}>
              Nullstill filtre
            </button>
          )}
        </EmptyResults>
      )}
      {showCandidates && (
        <TerminateCommitteeZone
          admissionSlug={admissionSlug ?? ""}
          terminationGroup={terminationGroup}
          isAdmin={admission.userdata.is_admin}
          isCommitteeMinimal={isCommitteeMinimal}
        />
      )}
    </PageWrapper>
  );
};

export default ViewApplications;
