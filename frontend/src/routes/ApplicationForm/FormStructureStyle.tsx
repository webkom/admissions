import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

export const PageWrapper = styled.div`
  width: 100%;
  padding: 0 1rem;
  margin: 0 auto 4em auto;
  min-height: calc(
    100vh - 70px - 2rem - 4em
  ); /* Calculated to never overflow navbar/padding/margin */
  display: flex;
  flex-direction: column;
  align-items: center;

  form {
    max-width: 100%;
  }

  ${media.portrait`
    max-width: 80%;
    width: 600px;
  `};

  ${media.handheld`
    max-width: 100%;
  `};
`;

export const Title = styled.h1`
  color: rgba(129, 129, 129, 0.59);
  font-size: 1.3rem;
  margin: 1.6rem 0 1.3rem;
  line-height: 1.5em;

  ${media.handheld`
    margin: 1.5rem 1rem;
    font-size: 1.2rem;
    line-height: 1.2em;
  `};
`;

export const SeparatorLine = styled.div`
  display: block;
  background: var(--color-gray-3);
  height: 1px;
`;

export const FormHeader = styled.div`
  display: flex;
  justify-content: space-between;
  width: 100%;
  max-width: 750px;
  margin: 1em 0 1em 0;

  ${media.handheld`
    max-width: 100%;
    margin-bottom: 1em;
    flex-direction: column;
  `};
`;

export const CancelButtonContainer = styled.div`
  display: flex;
  align-items: center;
  ${media.handheld`
  justify-content: center;`};
`;

/* General info section, mobile number, priorities */
type InfoSectionProps = {
  $columnCount?: number;
};

export const GeneralInfoSection = styled.div<InfoSectionProps>`
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 2rem;
  max-width: 750px;
  margin-bottom: 1.5rem;

  > h2 {
    flex-basis: 100%;
  }

  > span {
    flex-basis: ${({ $columnCount = 2 }) =>
      `calc(${(1 / $columnCount) * 100}% - ${($columnCount - 1) * 1}rem)`};
  }

  > div {
    flex-basis: 50%;
  }

  ${media.portrait`
    gap: 0.5rem ;

    > span {
      flex-basis: 100%;
      margin-top: 0;
    }

    > div {
      flex-basis: 100%;
    }
  `};
`;

export const SectionHeader = styled.h2`
  font-size: 1.3rem;
  margin: 1rem 0 0;
  letter-spacing: 1px;
`;

export const Notice = styled.p`
  font-style: italic;
  font-size: 1rem;
  line-height: 1.4rem;

  ${media.handheld`
    font-size: 0.9rem;
    line-height: 1.1rem;
    max-width: 300px;
  `}
`;

export const Text = styled.p`
  font-size: 1rem;
  line-height: 1.4rem;

  ${media.handheld`
    font-size: 0.9rem;
    line-height: 1.1rem;
    max-width: 300px;
  `}
`;

export const InfoText = styled.span`
  font-size: 0.9rem;
  line-height: 1.5rem;

  ${media.portrait`
    font-size: 0.8rem;
  `};

  ul {
    list-style-type: disc;
    margin-left: 1rem;
  }
`;

export const HelpText = styled(InfoText)`
  color: rgba(57, 75, 89, 0.75);
  margin-left: calc(-2.6rem + 4px);
  display: flex;

  i {
    color: var(--color-gray-3);
    font-size: 1.6rem;
    margin-right: 1rem;
  }

  ${media.portrait`
    margin-left: 0;

    i {
      margin-right: 0.5rem;
      font-size: 1.3rem;

    }
  `};
`;

/* Groups section */

type GroupsSectionProps = {
  $isSingleGroupAdmission: boolean;
};

export const GroupsSection = styled.div<GroupsSectionProps>`
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  grid-template-areas: "sidebar applications";
  grid-gap: 1rem 2rem;
  max-width: 750px;

  ${media.portrait`
    grid-template-columns: 100%;
    grid-template-areas:
      "sidebar"
      "applications";
    grid-gap: 0.5rem ;

    > span {
      margin-top: 1.5rem;;
    }
  `};

  ${({ $isSingleGroupAdmission }) =>
    $isSingleGroupAdmission &&
    `grid-template-areas: "applications";
    grid-template-columns: 100%`};
`;

export const Sidebar = styled.div`
  grid-area: sidebar;
  margin-bottom: 2rem;

  > div {
    position: sticky;
    top: 2rem;

    > h2 {
      margin-bottom: 0.5rem;
    }

    > span {
      margin-top: 0.5rem;
      margin-bottom: 0.9rem;
    }

    > div {
      margin-top: 1.5rem;
    }
  }
  ${media.portrait`
    margin-bottom: 1rem;
    > div {
      > span {
        margin-bottom: 1.5rem;
      }
    }
  `};
`;

export const Applications = styled.div`
  grid-area: applications;
`;

/* Submit section, privacy and data notice */

export const SubmitSection = styled.div`
  display: grid;
  grid-template-columns: 4fr 1.25fr;
  max-width: 750px;
  margin-top: 2rem;
  align-items: center;

  ${media.portrait`
    grid-template-columns: 100%;

    button {
      margin-top: 2rem;
    }
  `};
`;

interface StyledSpanProps {
  $red?: boolean;
  $bold?: boolean;
}

export const StyledSpan = styled.span<StyledSpanProps>`
  color: ${(props) => (props.$red ? "var(--lego-red-color)" : "inherit")};
  font-weight: ${(props) => (props.$bold ? "600" : "normal")};
`;

export const ApplicationDateInfo = styled.p`
  font-size: 0.95rem;
  line-height: 1.3rem;
  margin-top: 0rem;
`;

export const SubmitInfo = styled.p`
  font-size: 0.9rem;
  color: rgba(57, 75, 89, 0.75);
  line-height: 1.3rem;
  padding-right: 3rem;

  ${media.portrait`
    padding-right: 0;
  `};
`;

/* (Groups section) No chosen groups */

export const NoChosenGroupsWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 5rem;
  text-align: center;

  ${media.portrait`
    margin: 0 0 4rem 0;
  `};
`;

export const NoChosenTitle = styled(Title).attrs({ as: "h3" })``;

export const NoChosenSubTitle = styled.span`
  font-size: 1rem;
  font-weight: 500;
  color: rgba(129, 129, 129, 0.4);
  max-width: 50%;
  text-align: center;
  line-height: 1rem;
  margin-bottom: 3rem;

  ${media.portrait`
    margin-bottom: 2rem;
  `};
`;

/* Reciept info (in top of page after sending in application) */

export const RecieptInfo = styled.div`
  display: flex;
  align-items: center;
  flex-direction: column;
`;

export const RecievedApplicationBanner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  align-items: space-between;
  background: var(--color-green-6);
  border: 1px solid #809e33;
  border-radius: 13px;
  padding: 0.8rem 2rem;
  color: var(--color-white);
  font-weight: 600;
  font-size: 1.1rem;

  > span {
    margin-right: 1rem;
  }

  ${media.handheld`
  font-size: 1rem;
  `};
`;

export const EditWrapper = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  max-width: 750px;
`;

export const EditInfo = styled.div`
  flex-basis: 60%;

  ${media.portrait`
  flex-basis: 100%;
  `}
`;

export const EditActions = styled.div`
  display: flex;
  flex-direction: column;
  flex-basis: 40%;
  justify-content: center;

  > button {
    margin: 0.4rem auto;
  }

  ${media.portrait`
  flex-basis: 100%;
  `}
`;

export const TimeStamp = styled.p`
  text-align: center;
  font-size: 1.1rem;
  line-height: 1.8rem;

  i {
    margin-right: 0.7rem;
    font-size: 1.4rem;
    vertical-align: top;
    line-height: inherit;
  }

  ${media.handheld`
    flex-direction: column;
    margin-bottom: 2rem;
    i {
      display: none;
    }
  `};
`;
