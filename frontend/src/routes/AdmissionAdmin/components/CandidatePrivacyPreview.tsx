import React from "react";
import { Eye, EyeOff } from "lucide-react";

import cn from "src/utils/cn";
import { iconSizes } from "src/styles/designTokens";
import {
  actionButtonBase,
  actionButtonPrimary,
} from "src/components/Scheduling/ui";

import {
  PrivacyPreview,
  PrivacySkeleton,
  SkeletonApplication,
  SkeletonApplicationAction,
  SkeletonApplicationBody,
  SkeletonApplicationHeader,
  SkeletonApplicationTitle,
  SkeletonAnswer,
  SkeletonFilter,
  SkeletonFilterGrid,
  SkeletonFilters,
  SkeletonHeading,
  SkeletonLine,
  SkeletonPill,
  SkeletonStatusRow,
  SkeletonTable,
  SkeletonTableHeader,
  SkeletonTableRow,
  PrivacyAlert,
  PrivacyAlertIcon,
  PrivacyAlertTitle,
  PrivacyAlertText,
} from "./CandidatePrivacyPreview.styles";

interface CandidatePrivacyPreviewProps {
  onReveal: () => void;
}

/**
 * Overlay shown while candidate data is hidden behind the explicit reveal
 * action. Renders a blurred skeleton mock of the application table together
 * with the privacy notice + reveal button.
 */
const CandidatePrivacyPreview: React.FC<CandidatePrivacyPreviewProps> = ({
  onReveal,
}) => (
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

export default CandidatePrivacyPreview;
