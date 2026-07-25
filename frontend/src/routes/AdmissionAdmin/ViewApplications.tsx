import React, { useMemo, useState } from "react";
import styled from "styled-components";
import { DateTime } from "luxon";

import { StyledButton } from "src/components/LinkButton";
import LoadingBall from "src/components/LoadingBall";
import ConfirmDialog from "src/components/Scheduling/ConfirmDialog";
import AdmissionsContainer from "src/containers/AdmissionsContainer";
import { escapeCsvCell } from "src/utils/methods";
import { useAdmission, useAdminApplications } from "src/query/hooks";
import { useTerminateCommitteeMutation } from "src/query/mutations";
import { isSensitiveAuthorityChangedError } from "src/query/sensitiveAccess";
import { useParams, useSearchParams } from "react-router-dom";
import {
  ChevronDown,
  Eye,
  EyeOff,
  FileDown,
  RotateCcw,
  Search,
} from "lucide-react";

import CSVExportHandler, {
  CompleteCsvData,
} from "./components/CSVExportHandler";
import {
  actionButtonBase,
  actionButtonDanger,
  actionButtonNeutral,
  actionButtonPrimary,
} from "src/components/Scheduling/ui";
import cn from "src/utils/cn";
import { breakpoints, iconSizes } from "src/styles/designTokens";
import { getApiErrorMessage } from "src/utils/apiErrors";
import { CustomSelect } from "src/components/ui";
import { interviewStatusOptions } from "src/utils/interviewStatus";
import type { Group } from "src/types";

const CSV_TIME_ZONE = "Europe/Oslo";

const formatCsvDate = (value: string): string => {
  const date = DateTime.fromISO(value).setZone(CSV_TIME_ZONE);
  return date.isValid ? date.setLocale("nb").toFormat("dd.MM.yyyy HH:mm") : "";
};

const filenamePart = (value: string): string =>
  value
    .toLocaleLowerCase("nb-NO")
    .replaceAll("ø", "o")
    .replaceAll("æ", "ae")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeSearchValue = (value: string): string =>
  value.trim().toLocaleLowerCase("nb-NO");

const normalizePhoneSearch = (value: string): string =>
  value.replace(/[^\d+]/g, "");

const ViewApplications = () => {
  const { admissionSlug } = useParams();
  const [searchParams] = useSearchParams();
  const [showCandidates, setShowCandidates] = useState(false);
  const [showCsvExport, setShowCsvExport] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedInterviewStatus, setSelectedInterviewStatus] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [terminateDialogOpen, setTerminateDialogOpen] = useState(false);
  const [terminationName, setTerminationName] = useState("");
  const [terminationError, setTerminationError] = useState<string>();
  const [terminationSuccess, setTerminationSuccess] = useState<string>();

  const {
    data: applications,
    error: applicationsError,
    isLoading: applicationsIsLoading,
    refetch: refetchApplications,
  } = useAdminApplications(admissionSlug ?? "");
  const {
    data: admission,
    error: admissionError,
    isLoading: admissionIsLoading,
    refetch: refetchAdmission,
  } = useAdmission(admissionSlug ?? "");
  const terminateCommittee = useTerminateCommitteeMutation(admissionSlug ?? "");
  const sortedApplications = useMemo(
    () =>
      [...(applications ?? [])].sort((a, b) =>
        a.user.full_name.localeCompare(b.user.full_name, "nb"),
      ),
    [applications],
  );
  const availableGroups = useMemo(
    () =>
      (admission?.groups ?? [])
        .filter(
          (group) =>
            admission?.userdata.is_admin ||
            admission?.userdata.represented_groups.includes(group.name),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "nb")),
    [admission],
  );
  const scopedGroup = useMemo(() => {
    const groupId = searchParams.get("group");
    return groupId
      ? availableGroups.find(
          (group) => group.pk === groupId || group.name === groupId,
        )
      : undefined;
  }, [availableGroups, searchParams]);
  const activeGroupIds = useMemo(
    () => (scopedGroup ? [scopedGroup.pk] : selectedGroupIds),
    [scopedGroup, selectedGroupIds],
  );
  const showGroupFilter = !scopedGroup && availableGroups.length > 1;
  const terminationGroup = useMemo(() => {
    if (scopedGroup) return scopedGroup;
    if (availableGroups.length === 1) return availableGroups[0];
    return selectedGroupIds.length === 1
      ? availableGroups.find((group) => group.pk === selectedGroupIds[0])
      : undefined;
  }, [availableGroups, scopedGroup, selectedGroupIds]);
  const groupApplicationCounts = useMemo(
    () =>
      Object.fromEntries(
        availableGroups.map((group) => [
          group.pk,
          sortedApplications.filter((application) =>
            application.group_applications.some(
              (groupApplication) => groupApplication.group.pk === group.pk,
            ),
          ).length,
        ]),
      ),
    [availableGroups, sortedApplications],
  );
  const filteredApplications = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(searchTerm);
    const normalizedPhone = normalizePhoneSearch(searchTerm);

    return sortedApplications.flatMap((application) => {
      if (
        selectedInterviewStatus &&
        application.interview_status !== selectedInterviewStatus
      ) {
        return [];
      }

      if (
        normalizedSearch &&
        ![
          application.user.full_name,
          application.user.username,
          application.user.email,
          application.phone_number,
        ].some((value) =>
          normalizeSearchValue(value).includes(normalizedSearch),
        ) &&
        (!normalizedPhone ||
          !normalizePhoneSearch(application.phone_number).includes(
            normalizedPhone,
          ))
      ) {
        return [];
      }

      const groupApplications =
        activeGroupIds.length > 0
          ? application.group_applications.filter((groupApplication) =>
              activeGroupIds.includes(groupApplication.group.pk),
            )
          : application.group_applications;

      return groupApplications.length > 0
        ? [{ ...application, group_applications: groupApplications }]
        : [];
    });
  }, [activeGroupIds, searchTerm, selectedInterviewStatus, sortedApplications]);

  const showGroupColumn = useMemo(
    () =>
      new Set(
        filteredApplications.flatMap((application) =>
          application.group_applications.map(
            (groupApplication) => groupApplication.group.pk,
          ),
        ),
      ).size > 1,
    [filteredApplications],
  );
  const csvHeaders = useMemo(
    () => [
      { label: "Fullt navn", key: "name" },
      ...(showGroupColumn ? [{ label: "Gruppe", key: "group" }] : []),
      { label: "Søknadstekst", key: "groupApplicationText" },
      ...(admission?.userdata.is_admin
        ? [{ label: "Prioriteringer", key: "priorityText" }]
        : []),
      { label: "E-post", key: "email" },
      { label: "Mobilnummer", key: "phoneNumber" },
      { label: "Brukernavn", key: "username" },
      { label: "Søkt innen frist", key: "appliedWithinDeadline" },
      { label: "Tid sendt", key: "createdAt" },
      { label: "Tid oppdatert", key: "updatedAt" },
    ],
    [admission?.userdata.is_admin, showGroupColumn],
  );
  const csvData = useMemo(
    () =>
      filteredApplications.flatMap((application) => {
        return application.group_applications.map((groupApplication) => ({
          name: application.user.full_name,
          group: groupApplication.group.name,
          groupApplicationText: groupApplication.text,
          priorityText: application.priority_text ?? "",
          email: application.user.email,
          phoneNumber: application.phone_number,
          username: application.user.username,
          appliedWithinDeadline: application.applied_within_deadline
            ? "Ja"
            : "Nei",
          createdAt: formatCsvDate(application.created_at),
          updatedAt: formatCsvDate(application.updated_at),
        }));
      }),
    [filteredApplications],
  );

  const visibleCsvData = showCandidates ? csvData : [];
  const exportCsvData = visibleCsvData.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === "string" ? escapeCsvCell(value) : value,
      ]),
    ),
  ) as CompleteCsvData[];
  const exportFilename = `${admission?.slug ?? "opptak"}-${
    activeGroupIds.length > 0
      ? filenamePart(
          activeGroupIds
            .map(
              (groupId) =>
                availableGroups.find((group) => group.pk === groupId)?.name ??
                "gruppe",
            )
            .join("-"),
        )
      : "alle-grupper"
  }-${DateTime.now().setZone(CSV_TIME_ZONE).toFormat("yyyy-LL-dd")}.csv`;
  const filtersAreActive =
    searchTerm.trim() !== "" ||
    selectedInterviewStatus !== "" ||
    selectedGroupIds.length > 0;

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedInterviewStatus("");
    setSelectedGroupIds([]);
  };

  const closeTerminateDialog = () => {
    if (terminateCommittee.isPending) return;
    setTerminateDialogOpen(false);
    setTerminationName("");
  };

  const terminateScopedCommittee = () => {
    if (
      !terminationGroup ||
      terminationName.toLowerCase() !== terminationGroup.name.toLowerCase()
    ) {
      return;
    }
    setTerminationError(undefined);
    terminateCommittee.mutate(
      {
        groupId: terminationGroup.pk,
        confirmationName: terminationName,
      },
      {
        onSuccess: () => {
          setTerminateDialogOpen(false);
          setTerminationName("");
          setTerminationSuccess(
            `Søknadsdata for ${terminationGroup.name} er slettet permanent.`,
          );
        },
        onError: (error) => {
          if (isSensitiveAuthorityChangedError(error)) return;
          setTerminationError(
            getApiErrorMessage(
              error,
              "Kunne ikke slette komitédata. Prøv igjen.",
            ),
          );
        },
      },
    );
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
  } else if (applicationsIsLoading || admissionIsLoading) {
    return <LoadingBall />;
  } else if (!admission) {
    return <p>Opptak {admissionSlug} ble ikke funnet i systemet.</p>;
  } else {
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
                className={cn(
                  actionButtonBase,
                  actionButtonNeutral,
                  "px-3 py-2",
                )}
              >
                <FileDown size={iconSizes.control} aria-hidden="true" />
                Eksporter CSV
              </button>
              <button
                type="button"
                aria-pressed={showCandidates}
                onClick={() => {
                  setShowCandidates(false);
                  setShowCsvExport(false);
                }}
                className={cn(
                  actionButtonBase,
                  actionButtonNeutral,
                  "px-3 py-2",
                )}
              >
                <EyeOff size={iconSizes.control} />
                Skjul kandidatdata
              </button>
            </HeaderControls>
          )}
        </Header>

        {showCandidates ? (
          <>
            <FilterSection aria-label="Søk og filtrer søknader">
              <ResultMeta aria-live="polite">
                Viser {filteredApplications.length} av{" "}
                {sortedApplications.length}{" "}
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
                  <GroupMultiSelect
                    groups={availableGroups}
                    counts={groupApplicationCounts}
                    selectedGroupIds={selectedGroupIds}
                    onChange={setSelectedGroupIds}
                  />
                </FilterControl>
              )}
              {filtersAreActive && (
                <ResetFilters
                  type="button"
                  onClick={resetFilters}
                  aria-label="Nullstill søk og filtre"
                >
                  <RotateCcw size={iconSizes.control} aria-hidden="true" />
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
          <CandidatePrivacyPreview onReveal={() => setShowCandidates(true)} />
        )}
        {showCandidates && filteredApplications.length > 0 && (
          <AdmissionsContainer
            admission={admission}
            applications={filteredApplications}
            showGroupColumn={showGroupColumn}
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
        {showCandidates && admission.userdata.is_admin && (
          <DangerZone>
            <summary>Faresone</summary>
            <DangerZoneContent>
              {!terminationGroup && (
                <TerminationScopeHint>
                  Velg nøyaktig én komité i gruppefilteret før du kan terminere
                  den.
                </TerminationScopeHint>
              )}
              {terminationGroup && (
                <TerminateCommitteePanel aria-labelledby="terminate-committee-title">
                  <div>
                    <h2 id="terminate-committee-title">Slett alle søknader</h2>
                    <p>
                      Dette sletter alle søknader til komiteen i dette opptaket.
                      Handlingen kan ikke angres. Bruk denne funksjonen først
                      når opptaket er ferdigbehandlet og søknadene ikke lenger
                      skal oppbevares. Webkom sletter søknadsdataene automatisk
                      etter en tid, men her kan du slette dem umiddelbart.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={cn(actionButtonBase, actionButtonDanger)}
                    onClick={() => {
                      setTerminationError(undefined);
                      setTerminationSuccess(undefined);
                      setTerminateDialogOpen(true);
                    }}
                  >
                    Terminer komité
                  </button>
                </TerminateCommitteePanel>
              )}
              {terminationSuccess && (
                <TerminationStatus role="status">
                  {terminationSuccess}
                </TerminationStatus>
              )}
              {terminationError && (
                <TerminationError role="alert">
                  {terminationError}
                </TerminationError>
              )}
            </DangerZoneContent>
          </DangerZone>
        )}
        {terminateDialogOpen && terminationGroup && (
          <ConfirmDialog
            title={`Terminer ${terminationGroup.name}?`}
            confirmLabel="Slett permanent"
            onClose={closeTerminateDialog}
            onConfirm={terminateScopedCommittee}
            confirmDisabled={
              terminationName.toLowerCase() !==
              terminationGroup.name.toLowerCase()
            }
            busy={terminateCommittee.isPending}
            tone="danger"
          >
            <p>
              Dette kan ikke angres. Skriv{" "}
              <strong>{terminationGroup.name}</strong> for å bekrefte at alle
              søknadsdata for denne komiteen skal slettes.
            </p>
            <p>
              Søkere som bare har søkt denne komiteen fjernes også fra en
              eksisterende intervjuplan, og aktive kjøringer av
              planleggingsverktøyet stoppes.
            </p>
            {terminationError && (
              <DialogTerminationError role="alert">
                {terminationError}
              </DialogTerminationError>
            )}
            <label htmlFor="terminate-committee-confirmation">Komiténavn</label>
            <TerminationInput
              id="terminate-committee-confirmation"
              value={terminationName}
              onChange={(event) =>
                setTerminationName(event.target.value.toLowerCase())
              }
              autoComplete="off"
              spellCheck={false}
            />
          </ConfirmDialog>
        )}
      </PageWrapper>
    );
  }
};

export default ViewApplications;

interface GroupMultiSelectProps {
  groups: Group[];
  counts: Record<string, number>;
  selectedGroupIds: string[];
  onChange: (groupIds: string[]) => void;
}

const GroupMultiSelect: React.FC<GroupMultiSelectProps> = ({
  groups,
  counts,
  selectedGroupIds,
  onChange,
}) => {
  const detailsRef = React.useRef<HTMLDetailsElement>(null);
  const selectedNames = groups
    .filter((group) => selectedGroupIds.includes(group.pk))
    .map((group) => group.name);
  const summary =
    selectedNames.length === 0
      ? "Alle"
      : selectedNames.length === 1
        ? selectedNames[0]
        : `${selectedNames.length} valgt`;

  const toggleGroup = (groupId: string) => {
    onChange(
      selectedGroupIds.includes(groupId)
        ? selectedGroupIds.filter((id) => id !== groupId)
        : [...selectedGroupIds, groupId],
    );
  };

  React.useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      if (!detailsRef.current?.contains(event.target as Node)) {
        detailsRef.current?.removeAttribute("open");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && detailsRef.current?.hasAttribute("open")) {
        detailsRef.current?.removeAttribute("open");
        detailsRef.current?.querySelector("summary")?.focus();
      }
    };

    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <GroupFilterDetails ref={detailsRef}>
      <summary aria-label={`Filtrer på gruppe: ${summary}`}>
        <span>{summary}</span>
        <ChevronDown size={iconSizes.small} aria-hidden="true" />
      </summary>
      <GroupFilterOptions>
        <GroupFilterAll
          type="button"
          onClick={() => onChange([])}
          aria-pressed={selectedGroupIds.length === 0}
        >
          Alle grupper
        </GroupFilterAll>
        {groups.map((group) => (
          <label key={group.pk}>
            <input
              type="checkbox"
              checked={selectedGroupIds.includes(group.pk)}
              onChange={() => toggleGroup(group.pk)}
            />
            <span>{group.name}</span>
            <small>{counts[group.pk] ?? 0}</small>
          </label>
        ))}
      </GroupFilterOptions>
    </GroupFilterDetails>
  );
};

const CandidatePrivacyPreview = ({ onReveal }: { onReveal: () => void }) => (
  <PrivacyPreview>
    <PrivacySkeleton aria-hidden="true">
      <SkeletonFilters>
        <SkeletonHeading />
        <SkeletonFilterGrid>
          <SkeletonFilter />
          <SkeletonFilter />
          <SkeletonFilter />
        </SkeletonFilterGrid>
        <SkeletonStatusRow>
          <SkeletonPill />
          <SkeletonPill />
          <SkeletonPill />
          <SkeletonPill />
        </SkeletonStatusRow>
      </SkeletonFilters>
      <SkeletonTable>
        <SkeletonTableHeader>
          {Array.from({ length: 6 }, (_, index) => (
            <SkeletonLine key={index} $width={`${48 + index * 6}%`} />
          ))}
        </SkeletonTableHeader>
        {Array.from({ length: 3 }, (_, rowIndex) => (
          <SkeletonTableRow key={rowIndex}>
            {Array.from({ length: 6 }, (_, columnIndex) => (
              <SkeletonLine
                key={columnIndex}
                $width={`${42 + ((rowIndex + columnIndex) % 4) * 12}%`}
              />
            ))}
          </SkeletonTableRow>
        ))}
      </SkeletonTable>
      <SkeletonApplication>
        <SkeletonApplicationHeader>
          <SkeletonApplicationTitle />
          <SkeletonApplicationAction />
        </SkeletonApplicationHeader>
        <SkeletonApplicationBody>
          <SkeletonAnswer $width="82%" />
          <SkeletonAnswer $width="64%" />
          <SkeletonAnswer $width="91%" />
          <SkeletonAnswer $width="72%" />
        </SkeletonApplicationBody>
      </SkeletonApplication>
    </PrivacySkeleton>

    <PrivacyAlert role="alert">
      <PrivacyAlertIcon>
        <EyeOff size={iconSizes.feature} aria-hidden="true" />
      </PrivacyAlertIcon>
      <div>
        <PrivacyAlertTitle>Kandidatdata er skjult</PrivacyAlertTitle>
        <PrivacyAlertText>
          Søknader og antall kandidater er sensitiv informasjon. Vis innholdet
          bare når du er klar til å behandle kandidatene, og unngå å dele
          skjermen med andre.
        </PrivacyAlertText>
      </div>
      <button
        type="button"
        onClick={onReveal}
        className={cn(actionButtonBase, actionButtonPrimary, "px-4 py-2")}
      >
        <Eye size={iconSizes.control} aria-hidden="true" />
        Vis kandidatdata
      </button>
    </PrivacyAlert>
  </PrivacyPreview>
);

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  width: 100%;
`;

const ErrorState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-md);
  max-width: var(--content-width-form);
  padding: var(--spacing-xl);

  h2,
  p {
    margin: 0;
  }
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-md) 0 var(--spacing-lg);
  border-bottom: var(--border-width-default) solid var(--color-border-soft);

  @media screen and (max-width: ${breakpoints.compact}) {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--spacing-md);
  }
`;

const Title = styled.h1`
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--font-size-xl);
  font-weight: 600;
  line-height: var(--line-height-base);
  text-align: left;
`;

const ResultMeta = styled.p`
  width: 100%;
  margin: var(--spacing-xs) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
`;

const HeaderControls = styled.div`
  display: flex;
  align-items: center;
  gap: var(--spacing-xl);
  flex-wrap: wrap;
  justify-content: flex-end;

  @media screen and (max-width: ${breakpoints.compact}) {
    width: 100%;
    gap: var(--spacing-sm);
    justify-content: flex-start;

    button {
      flex: 1 1 10rem;
      justify-content: center;
    }
  }
`;

const FilterSection = styled.section`
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: var(--spacing-lg);
  width: 100%;
  padding: 0 0 var(--spacing-md);
  border-bottom: var(--border-width-default) solid var(--color-border-soft);

  @media screen and (max-width: ${breakpoints.compact}) {
    gap: var(--spacing-md);

    > label:first-child {
      flex-basis: 100%;
    }

    > div {
      flex: 1 1 9rem;
    }
  }
`;

const TerminateCommitteePanel = styled.section`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-lg);
  width: 100%;
  padding: var(--spacing-lg);
  border: var(--border-width-default) solid var(--color-danger-border);
  border-radius: var(--border-radius-md);
  background: var(--color-danger-bg);

  h2,
  p {
    margin: 0;
  }

  h2 {
    color: var(--color-danger);
    font-size: var(--font-size-md);
  }

  p {
    margin-top: var(--spacing-xs);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    line-height: var(--line-height-base);
  }

  @media screen and (max-width: ${breakpoints.compact}) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const DangerZone = styled.details`
  margin-top: var(--spacing-3xl);
  border-top: var(--border-width-default) solid var(--color-border-soft);

  summary {
    padding: var(--spacing-lg) 0;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);

    &:hover {
      color: var(--color-text-primary);
    }
  }
`;

const DangerZoneContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding-bottom: var(--spacing-lg);
`;

const TerminationScopeHint = styled.p`
  width: 100%;
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
`;

const TerminationStatus = styled.p`
  width: 100%;
  margin: 0;
  padding: var(--spacing-md);
  border: var(--border-width-default) solid var(--color-success-border);
  border-radius: var(--border-radius-md);
  background: var(--color-success-bg);
  color: var(--color-success);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
`;

const TerminationError = styled.p`
  width: 100%;
  margin: 0;
  padding: var(--spacing-md);
  border: var(--border-width-default) solid var(--color-danger-border);
  border-radius: var(--border-radius-md);
  background: var(--color-danger-bg);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
`;

const DialogTerminationError = styled.p`
  margin: var(--spacing-md) 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
`;

const TerminationInput = styled.input`
  width: 100%;
  min-height: var(--control-height-md);
  margin-top: var(--spacing-xs);
  padding: 0 var(--spacing-md);
  border: var(--border-width-default) solid var(--color-border-muted);
  border-radius: var(--border-radius-sm);
  background: var(--color-surface-base);
  color: var(--color-text-primary);
  font: inherit;

  &:focus {
    border-color: var(--color-brand);
    outline: none;
    box-shadow: 0 0 0 3px var(--color-brand-ring-soft);
  }
`;

const SearchField = styled.label`
  display: flex;
  flex: 1 1 20rem;
  align-items: center;
  gap: var(--spacing-sm);
  min-height: var(--control-height-md);
  padding: 0 var(--spacing-md);
  border: var(--border-width-default) solid var(--color-border-muted);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-base);
  color: var(--color-text-muted);

  &:focus-within {
    border-color: var(--color-brand);
    box-shadow: 0 0 0 3px var(--color-brand-ring-soft);
  }

  input {
    min-width: 0;
    width: 100%;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--color-text-primary);
    font: inherit;
  }
`;

const FilterControl = styled.div`
  display: flex;
  flex: 0 1 11rem;
  flex-direction: column;
  gap: var(--spacing-xs);
  min-width: 9rem;
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
  font-weight: var(--font-weight-semibold);
`;

const GroupFilterDetails = styled.details`
  position: relative;
  min-width: 0;
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);

  &[open] > summary {
    border-color: var(--color-brand);
  }

  &[open] > summary svg {
    transform: rotate(180deg);
  }

  summary {
    display: flex;
    height: var(--control-height-md);
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
    padding: 0 var(--spacing-md);
    border: var(--border-width-default) solid var(--color-border-muted);
    border-radius: var(--border-radius-md);
    background: var(--color-surface-base);
    cursor: pointer;
    list-style: none;
    font-weight: var(--font-weight-semibold);

    &::-webkit-details-marker {
      display: none;
    }

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--color-brand-ring-soft);
    }

    span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    svg {
      flex: 0 0 auto;
      color: var(--color-text-muted);
      transition: transform var(--easing-fast);
    }
  }
`;

const GroupFilterOptions = styled.div`
  position: absolute;
  z-index: var(--popover-layer);
  top: calc(100% + var(--spacing-xs));
  right: 0;
  display: grid;
  gap: var(--spacing-xs);
  width: max(100%, 15rem);
  max-height: min(22rem, 60vh);
  overflow-y: auto;
  padding: var(--spacing-sm);
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-base);
  box-shadow: var(--shadow-md);

  label {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--spacing-sm);
    min-height: var(--control-height-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--border-radius-sm);
    cursor: pointer;
    color: var(--color-text-primary);
    font-weight: var(--font-weight-medium);

    &:hover {
      background: var(--color-surface-subtle);
    }

    input {
      accent-color: var(--color-brand);
    }

    small {
      color: var(--color-text-muted);
      font-size: var(--font-size-detail);
      font-variant-numeric: tabular-nums;
    }
  }
`;

const GroupFilterAll = styled.button`
  min-height: var(--control-height-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 0;
  border-radius: var(--border-radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-weight: var(--font-weight-semibold);
  text-align: left;

  &[aria-pressed="true"],
  &:hover {
    background: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }
`;

const ResetFilters = styled.button`
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  min-height: var(--control-height-md);
  padding: var(--spacing-sm) var(--spacing-md);
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);

  &:hover {
    color: var(--color-text-primary);
  }

  &:focus-visible {
    border-radius: var(--border-radius-sm);
    outline: none;
    box-shadow: 0 0 0 3px var(--color-brand-ring-soft);
  }
`;

const EmptyResults = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-3xl) var(--spacing-xl);
  border: var(--border-width-default) dashed var(--color-border-muted);
  border-radius: var(--border-radius-lg);
  color: var(--color-text-muted);
  text-align: center;

  strong {
    color: var(--color-text-primary);
    font-size: var(--font-size-md);
  }

  button {
    margin-top: var(--spacing-md);
    border: 0;
    background: transparent;
    color: var(--color-brand);
    cursor: pointer;
    font: inherit;
    font-weight: var(--font-weight-semibold);
  }
`;

const PrivacyPreview = styled.section`
  position: relative;
  min-height: 34rem;
  overflow: hidden;
  border: var(--border-width-emphasis) solid var(--color-border-soft);
  border-radius: var(--border-radius-lg);
  background: linear-gradient(
      140deg,
      color-mix(in srgb, var(--color-surface-base) 82%, transparent),
      color-mix(in srgb, var(--color-surface-muted) 35%, transparent)
    ),
    var(--color-surface-base);
  box-shadow: var(--shadow-sm);
  isolation: isolate;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: var(--pattern-unavailable);
    opacity: 0.28;
    filter: blur(18px);
    transform: scale(1.1);
  }
`;

const PrivacySkeleton = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  opacity: 0.38;
  filter: blur(12px) grayscale(0.25) saturate(0.65);
  pointer-events: none;
  user-select: none;
  transform: scale(1.02);
`;

const SkeletonApplication = styled.div`
  display: grid;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-lg);
  background: var(--color-surface-base);
`;

const SkeletonApplicationHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding-bottom: var(--spacing-md);
  border-bottom: var(--border-width-default) solid var(--color-border-soft);
`;

const SkeletonApplicationTitle = styled.div`
  width: 11rem;
  height: 1rem;
  border-radius: var(--border-radius-pill);
  background: var(--color-border-muted);
`;

const SkeletonApplicationAction = styled.div`
  width: 2rem;
  height: 2rem;
  border-radius: var(--border-radius-sm);
  background: var(--color-surface-neutral);
`;

const SkeletonApplicationBody = styled.div`
  display: grid;
  gap: var(--spacing-lg);
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media screen and (max-width: ${breakpoints.compact}) {
    grid-template-columns: 1fr;
  }
`;

const SkeletonAnswer = styled.div<{ $width: string }>`
  display: grid;
  gap: var(--spacing-xs);

  &::before {
    width: 5rem;
    height: 0.65rem;
    border-radius: var(--border-radius-pill);
    background: var(--color-border-muted);
    content: "";
  }

  &::after {
    width: ${({ $width }) => $width};
    height: 0.8rem;
    border-radius: var(--border-radius-pill);
    background: var(--color-surface-neutral);
    content: "";
  }
`;

const SkeletonFilters = styled.div`
  padding: var(--spacing-md);
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-lg);
`;

const SkeletonHeading = styled.div`
  width: 8rem;
  height: 1rem;
  margin-bottom: var(--spacing-lg);
  border-radius: var(--border-radius-pill);
  background: var(--color-border-muted);
`;

const SkeletonFilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--spacing-md);

  @media screen and (max-width: ${breakpoints.compact}) {
    grid-template-columns: 1fr;
  }
`;

const SkeletonFilter = styled.div`
  height: var(--control-height-md);
  border-radius: var(--border-radius-lg);
  background: var(--color-surface-neutral);
`;

const SkeletonStatusRow = styled.div`
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-lg);
`;

const SkeletonPill = styled.div`
  width: 6rem;
  height: var(--control-height-sm);
  border-radius: var(--border-radius-pill);
  background: var(--color-surface-neutral);
`;

const SkeletonTable = styled.div`
  overflow: hidden;
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-lg);
`;

const SkeletonTableHeader = styled.div`
  display: grid;
  grid-template-columns: repeat(6, minmax(5rem, 1fr));
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--color-surface-neutral);
`;

const SkeletonTableRow = styled.div`
  display: grid;
  grid-template-columns: repeat(6, minmax(5rem, 1fr));
  gap: var(--spacing-md);
  min-height: 4.5rem;
  padding: var(--spacing-lg) var(--spacing-md);
  border-top: var(--border-width-default) solid var(--color-border-soft);
`;

const SkeletonLine = styled.div<{ $width: string }>`
  width: ${({ $width }) => $width};
  height: 0.75rem;
  border-radius: var(--border-radius-pill);
  background: var(--color-border-muted);
`;

const PrivacyAlert = styled.div`
  position: absolute;
  inset: 0;
  backdrop-filter: blur(16px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  padding: var(--spacing-xl);
  background: color-mix(in srgb, var(--color-surface-base) 68%, transparent);
  color: var(--color-text-muted);
  text-align: center;
  border: 1px solid
    color-mix(in srgb, var(--color-danger-border) 24%, transparent);
  box-shadow:
    inset 0 0 0 1px
      color-mix(in srgb, var(--color-surface-base) 82%, transparent),
    inset 0 0 28px
      color-mix(in srgb, var(--color-danger-border) 18%, transparent);
  z-index: 1;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: var(--pattern-unavailable);
    opacity: 0.24;
    pointer-events: none;
  }

  > div:nth-child(2) {
    max-width: var(--content-width-md);
  }
`;

const PrivacyAlertIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--control-height-md);
  height: var(--control-height-md);
  border: var(--border-width-default) solid
    color-mix(in srgb, var(--color-danger-border) 72%, transparent);
  border-radius: var(--border-radius-pill);
  background: color-mix(in srgb, var(--color-danger-bg) 58%, transparent);
  color: var(--color-danger);
`;

const PrivacyAlertTitle = styled.h2`
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--font-size-heading-sm);
  font-weight: 600;
`;

const PrivacyAlertText = styled.p`
  margin: var(--spacing-sm) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
`;
