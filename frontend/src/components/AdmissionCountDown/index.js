import React, { Component } from "react";
import moment from "moment-timezone";

class AdmissionCountDown extends Component {
  constructor(props) {
    super(props);
    this.state = {
      timeDiff: this.calcTimeDiff(),
    };
  }

  counterInterval;
  endTime = moment(this.props.endTime);

  componentDidMount() {
    this.counterInterval = setInterval(
      () =>
        this.setState({
          timeDiff: this.calcTimeDiff(),
        }),
      1000
    );
  }

  componentWillUnmount() {
    clearInterval(this.counterInterval);
  }

  calcTimeDiff() {
    const now = moment();
    const time = now.to(this.endTime);

    // If it's 1 day left we would like to say 'i morgen' and not 1 day
    const isTomorrow = moment().add("1", "day").isSame(this.endTime, "day");
    return isTomorrow ? "i morgen" : time;
  }

  render() {
    const now = moment();
    return (
      <p style={{ alignContent: "center" }}>
        Opptaket {now.isBefore(this.endTime) ? "åpner" : "åpnet"}{" "}
        {moment().isAfter(this.endTime) && "for "} {this.state.timeDiff}
      </p>
    );
  }
}

export default AdmissionCountDown;
