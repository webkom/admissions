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
  padding: 4rem 2rem;
  margin: 0 auto;
  max-width: var(--lego-max-width);
  min-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  align-items: center;

  form {
    width: 100%;
    max-width: 800px;
  }

  ${media.handheld`
    padding: 2rem 1rem;
  `};
`;

export const Title = styled.h1`
  font-size: var(--font-size-display-md);
  font-weight: 800;
  color: var(--color-text-primary);
  letter-spacing: -0.04em;
  margin: 0;
  text-align: left;

  ${media.handheld`
    font-size: var(--font-size-xl);
  `};
`;

export const SeparatorLine = styled.div`
  display: block;
  background: var(--color-border-soft);
  height: 1px;
  margin: 3rem 0;
`;

export const FormHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
  max-width: 800px;
  margin-bottom: 3rem;

  ${media.handheld`
    flex-direction: column;
    gap: var(--spacing-lg);
    margin-bottom: var(--spacing-xl);
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
  font-weight: 700;
  color: var(--color-text-primary);
  letter-spacing: -0.025em;
  margin: 0;
`;

export const InfoText = styled.span`
  font-size: var(--font-size-ui);
  line-height: 1.6;
  color: var(--color-text-body);

  ul {
    list-style-type: disc;
    margin-left: 1.25rem;
    margin-top: var(--spacing-sm);
  }
`;

export const HelpText = styled(InfoText)`
  color: var(--color-text-muted);
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: var(--spacing-md);
  background-color: var(--color-surface-subtle);
  border-radius: var(--border-radius-md);
  border: 1px solid var(--color-border-soft);

  i {
    color: var(--lego-red-color);
    font-size: var(--font-size-heading-xs);
    flex-shrink: 0;
  }
`;

export const GroupsSection = styled.div<GroupsSectionProps>`
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 3rem;
  width: 100%;

  ${media.portrait`
    grid-template-columns: 1fr;
    gap: var(--spacing-xl);
  `};

  ${({ $isSingleGroupAdmission }) =>
    $isSingleGroupAdmission && `grid-template-columns: 1fr;`};
`;

export const Sidebar = styled.div`
  margin-bottom: var(--spacing-xl);

  > div {
    position: sticky;
    top: 100px;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
`;

export const Applications = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
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
  border: 1px solid var(--color-border-soft);

  ${media.portrait`
    flex-direction: column;
    padding: var(--spacing-lg);
  `};
`;

export const StyledSpan = styled.span<StyledSpanProps>`
  color: ${(props) => (props.$red ? "var(--lego-red-color)" : "inherit")};
  font-weight: ${(props) => (props.$bold ? "700" : "inherit")};
`;

export const ApplicationDateInfo = styled.p`
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  margin: 0 0 0.75rem 0;
`;

export const SubmitInfo = styled.p`
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  line-height: 1.5;
  margin: 0 0 0.5rem 0;
  max-width: 500px;
`;

export const NoChosenGroupsWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  background-color: var(--color-surface-subtle);
  border-radius: var(--border-radius-lg);
  border: 2px dashed var(--color-border-soft);
`;

export const NoChosenTitle = styled.h2`
  font-size: var(--font-size-heading-xs);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-sm);
`;

export const NoChosenSubTitle = styled.span`
  font-size: var(--font-size-md);
  color: var(--color-text-muted);
  margin-bottom: var(--spacing-xl);
  max-width: 300px;
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
  gap: 0.75rem;
  font-size: var(--font-size-md);
  color: var(--color-text-body);
  margin-bottom: var(--spacing-lg);

  i {
    font-size: var(--font-size-heading-md);
    color: var(--color-green-6);
  }
`;
