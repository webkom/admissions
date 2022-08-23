import React, { useEffect, useState } from "react";
import moment from "moment-timezone";

const AdmissionCountDown = ({ endTime }) => {
  const [timeDiff, setTimeDiff] = useState(calcTimeDiff());

  const endTimeMoment = moment(endTime);

  useEffect(() => {
    const updateTimeDiffInterval = setInterval(
      () => setTimeDiff(calcTimeDiff()),
      1000
    );
    return () => {
      clearInterval(updateTimeDiffInterval);
    };
  }, []);

  const calcTimeDiff = () => {
    const now = moment();
    const time = now.to(endTimeMoment);

    // If it's 1 day left we would like to say 'i morgen' and not 1 day
    const isTomorrow = moment().add("1", "day").isSame(endTimeMoment, "day");
    return isTomorrow ? "i morgen" : time;
  };

  return (
    <p style={{ alignContent: "center" }}>
      Opptaket {moment().isBefore(endTimeMoment) ? "åpner " : "åpnet for "}
      {timeDiff}
    </p>
  );
};

export default AdmissionCountDown;
