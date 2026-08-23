import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

interface InfoSectionProps {
  $columnCount?: number;
}

interface GroupsSectionProps {
  $isSingleGroupAdmission?: boolean;
}

interface StyledSpanProps {
  $red?: boolean;
  $bold?: boolean;
}

export const PageWrapper = styled.div`
  width: 100%;
  padding: var(--spacing-4xl) var(--spacing-xl);
  margin: 0 auto;
  max-width: var(--content-width-page);
  min-height: var(--page-min-height);
  display: flex;
  flex-direction: column;
  align-items: center;

  form {
    width: 100%;
    max-width: var(--content-width-form);
  }

  ${media.handheld`
    padding: var(--spacing-xl) var(--spacing-md);
  `};
`;

export const Title = styled.h1`
  font-size: var(--font-size-display-md);
  font-weight: var(--font-weight-extrabold);
  color: var(--color-text-primary);
  letter-spacing: var(--letter-spacing-display-tight);
  margin: 0;
  text-align: left;

  ${media.handheld`
    font-size: var(--font-size-xl);
  `};
`;

export const SeparatorLine = styled.div`
  display: block;
  background: var(--color-border-soft);
  height: var(--border-width-default);
  margin: var(--spacing-3xl) 0;
`;

export const FormHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
  max-width: var(--content-width-form);
  margin-bottom: 0;

  ${media.handheld`
    flex-direction: column;
    gap: var(--spacing-lg);
  `};
`;

export const CancelButtonContainer = styled.div`
  display: flex;
  align-items: center;
`;

export const GeneralInfoSection = styled.div<InfoSectionProps>`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  width: 100%;
  margin-bottom: var(--spacing-xl);

  > h2 {
    margin-bottom: var(--spacing-sm);
  }
`;

export const SectionHeader = styled.h2`
  font-size: var(--font-size-heading-md);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  letter-spacing: var(--letter-spacing-display);
  margin: 0;
`;

export const InfoText = styled.span`
  font-size: var(--font-size-ui);
  line-height: var(--line-height-copy);
  color: var(--color-text-body);

  ul {
    list-style-type: disc;
    margin-left: var(--spacing-lg);
    margin-top: var(--spacing-sm);
  }
`;

export const HelpText = styled(InfoText)`
  color: var(--color-text-muted);
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-md);
  padding: 0 0 0 var(--spacing-md);
  border-left: var(--border-width-strong) solid var(--color-brand);

  i {
    color: var(--lego-red-color);
    font-size: var(--font-size-heading-xs);
    flex-shrink: 0;
  }
`;

export const GroupsSection = styled.div<GroupsSectionProps>`
  display: grid;
  grid-template-columns: var(--admin-sidebar-width) minmax(0, 1fr);
  gap: var(--spacing-3xl);
  width: 100%;

  ${media.portrait`
    grid-template-columns: 1fr;
    gap: var(--spacing-xl);
  `};

  ${({ $isSingleGroupAdmission }) =>
    $isSingleGroupAdmission && `grid-template-columns: 1fr;`};
`;

export const Sidebar = styled.div`
  margin: var(--spacing-xl) 0 0;
  max-width: var(--content-width-prose);

  > * {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }
`;

export const Applications = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2xl);
`;

export const SubmitSection = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacing-xl);
  margin-top: var(--spacing-md);
  padding: var(--spacing-xl);
  background-color: var(--color-surface-subtle);
  border-radius: var(--border-radius-lg);
  border: var(--border-width-default) solid var(--color-border-soft);

  ${media.portrait`
    flex-direction: column;
    padding: var(--spacing-lg);
  `};
`;

export const StyledSpan = styled.span<StyledSpanProps>`
  color: ${(props) => (props.$red ? "var(--lego-red-color)" : "inherit")};
  font-weight: ${(props) =>
    props.$bold ? "var(--font-weight-bold)" : "inherit"};
`;

export const ApplicationDateInfo = styled.p`
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-md) 0;
`;

export const SubmitInfo = styled.p`
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--spacing-sm) 0;
  max-width: var(--content-width-short);
`;

export const NoChosenGroupsWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-4xl) var(--spacing-xl);
  text-align: center;
  background-color: var(--color-surface-subtle);
  border-radius: var(--border-radius-lg);
  border: var(--border-width-emphasis) dashed var(--color-border-soft);
`;

export const NoChosenTitle = styled.h2`
  font-size: var(--font-size-heading-xs);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-sm);
`;

export const NoChosenSubTitle = styled.span`
  font-size: var(--font-size-md);
  color: var(--color-text-muted);
  margin-bottom: var(--spacing-xl);
  max-width: var(--content-width-narrow);
`;

export const EditInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
`;

export const Notice = styled.p`
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  font-style: italic;
  margin: 0;
`;

export const EditActions = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--spacing-xl);
  width: 100%;

  ${media.handheld`
    flex-direction: column;
    gap: var(--spacing-md);
    align-items: stretch;
  `}
`;

export const TimeStamp = styled.p`
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  font-size: var(--font-size-md);
  color: var(--color-text-body);
  margin-bottom: var(--spacing-lg);

  i {
    font-size: var(--font-size-heading-md);
    color: var(--color-green-6);
  }
`;
