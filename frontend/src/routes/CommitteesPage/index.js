import React, { Component } from "react";
import CommitteeCard from "src/components/CommitteeCard";

import {
  PageWrapper,
  PageTitle,
  CommitteeWrapper,
  NextCard,
  NextButton
} from "./styles.js";

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
      <PageWrapper>
        <PageTitle>Velg komiteer å søke på</PageTitle>
        <CommitteeWrapper>{CommitteeCards}</CommitteeWrapper>
        <NextCard>
          <NextButton bordercolor="gray" to="/application" margin="auto">
            Gå videre med valgte komiteer
          </NextButton>
        </NextCard>
      </PageWrapper>
    );
  }
}

export default CommitteesPage;
