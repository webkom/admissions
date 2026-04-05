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
  max-width: 1200px;
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
  font-size: 2.25rem;
  font-weight: 800;
  color: #111827;
  letter-spacing: -0.04em;
  margin: 0;
  text-align: left;

  ${media.handheld`
    font-size: 1.75rem;
  `};
`;

export const SeparatorLine = styled.div`
  display: block;
  background: #f3f4f6;
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
    gap: 1.5rem;
    margin-bottom: 2rem;
  `};
`;

export const CancelButtonContainer = styled.div`
  display: flex;
  align-items: center;
`;

export const GeneralInfoSection = styled.div<InfoSectionProps>`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  margin-bottom: 2rem;

  > h2 {
    margin-bottom: 0.5rem;
  }
`;

export const SectionHeader = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  letter-spacing: -0.025em;
  margin: 0;
`;

export const InfoText = styled.span`
  font-size: 0.9375rem;
  line-height: 1.6;
  color: #4b5563;

  ul {
    list-style-type: disc;
    margin-left: 1.25rem;
    margin-top: 0.5rem;
  }
`;

export const HelpText = styled(InfoText)`
  color: #6b7280;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  background-color: #f9fafb;
  border-radius: var(--border-radius-md);
  border: 1px solid #f3f4f6;

  i {
    color: var(--lego-red-color, #e11d48);
    font-size: 1.25rem;
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
    gap: 2rem;
  `};

  ${({ $isSingleGroupAdmission }) =>
    $isSingleGroupAdmission && `grid-template-columns: 1fr;`};
`;

export const Sidebar = styled.div`
  margin-bottom: 2rem;

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
  gap: 2rem;
  margin-top: 1rem;
  padding: 2rem;
  background-color: #f9fafb;
  border-radius: var(--border-radius-lg);
  border: 1px solid #f3f4f6;

  ${media.portrait`
    flex-direction: column;
    padding: 1.5rem;
  `};
`;

export const StyledSpan = styled.span<StyledSpanProps>`
  color: ${(props) =>
    props.$red ? "var(--lego-red-color, #e11d48)" : "inherit"};
  font-weight: ${(props) => (props.$bold ? "700" : "inherit")};
`;

export const ApplicationDateInfo = styled.p`
  font-size: 1rem;
  color: #111827;
  margin: 0 0 0.75rem 0;
`;

export const SubmitInfo = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
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
  background-color: #f9fafb;
  border-radius: var(--border-radius-lg);
  border: 2px dashed #e5e7eb;
`;

export const NoChosenTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
`;

export const NoChosenSubTitle = styled.span`
  font-size: 1rem;
  color: #6b7280;
  margin-bottom: 2rem;
  max-width: 300px;
`;

export const RecievedApplicationBanner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  background-color: #ecfdf5;
  border: 1px solid #d1fae5;
  border-radius: var(--border-radius-lg);
  padding: 1.5rem 2rem;
  color: #065f46;
  font-weight: 700;
  font-size: 1.125rem;
  box-shadow: var(--shadow-sm);
  margin-bottom: 2rem;

  ${media.handheld`
    font-size: 1rem;
    padding: 1rem 1.5rem;
  `};
`;

export const RecieptInfo = styled.div`
  margin-bottom: 3rem;
  width: 100%;
`;

export const EditWrapper = styled.div`
  display: flex;
  gap: 3rem;
  width: 100%;
  max-width: 800px;
  background-color: white;
  padding: 2.5rem;
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-md);
  border: 1px solid rgba(0, 0, 0, 0.05);

  ${media.portrait`
    flex-direction: column;
    gap: 2rem;
    padding: 1.5rem;
  `}
`;

export const EditInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

export const Text = styled.p`
  font-size: 1rem;
  color: #4b5563;
  margin: 0;
`;

export const Notice = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
  font-style: italic;
  margin: 0;
`;

export const EditActions = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2rem;
  width: 100%;

  ${media.handheld`
    flex-direction: column;
    gap: 1rem;
    align-items: stretch;
  `}
`;

export const TimeStamp = styled.p`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1rem;
  color: #4b5563;
  margin-bottom: 1.5rem;

  i {
    font-size: 1.5rem;
    color: #10b981;
  }
`;
