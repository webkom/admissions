import React, { Component } from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

import LinkButton from "src/components/LinkButton";
import CommitteeCard from "src/components/CommitteeCard";
import { Card, CardParagraph } from "src/components/Card";
import PageTitle from "src/components/PageTitle";

import "./CommitteesPage.css";

class CommitteesPage extends Component {
  constructor(props) {
    super(props);
    this.state = {};
  }

  startApplying = () => {
    const { selectedCommittees } = this.state;
    const committees = Object.keys(selectedCommittees).filter(
      committee => selectedCommittees[committee]
    );
    this.props.startApplying(committees);
  };

  toggleCommittee = name => {
    this.props.toggleCommittee(name.toLowerCase());
  };

  render() {
    const { committees } = this.props;
    const CommitteeCards = committees.map((committee, index) => (
      <CommitteeCard
        name={committee.name}
        description={committee.description}
        key={committee.name + "-" + index}
        onToggle={this.toggleCommittee}
        isChosen={!!this.props.selectedCommittees[committee.name.toLowerCase()]}
        readMoreLink={committee.detail_link}
      />
    ));
    return (
      <PageContainer>
        <PageTitle>Velg komitéer å søke på</PageTitle>

        <Card maxWidth="30em" margin="1em auto">
          <CardParagraph>
            Velg alle de komitéene du ønsker å søke på ved å trykke på boksen
            til komitéen. Les mer om de forskjellige komiteene på{" "}
            <a href="https://abakus.no/pages/info/om-oss" target="blank">
              abakus.no
            </a>
            .
          </CardParagraph>
        </Card>
        <CommittesContainer>
          {CommitteeCards}
          <CardNextDiv>
            <NextButton
              bordercolor="gray"
              to="/application"
              height="3em"
              margin="auto"
            >
              Videre ->
            </NextButton>
          </CardNextDiv>
        </CommittesContainer>
      </PageContainer>
    );
  }
}

const PageContainer = styled.div`
  width: 100%;
  margin: 0 auto 4em auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-items: center;
  ${media.handheld`
    width: 95vw;
    `};
`;

const CommittesContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  width: 100%;
  justify-content: space-between;
`;

const CardNextDiv = styled.div`
  width: 21rem;
  margin: 1em;
  padding: 2em 1em;
  display: flex;
  align-items: center;
  justify-contents: center;
`;

const NextButton = styled(LinkButton)`
  background: gray;
`;

export default CommitteesPage;
