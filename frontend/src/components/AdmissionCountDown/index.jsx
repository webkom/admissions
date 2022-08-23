import React, { useEffect, useState } from "react";
import { DateTime } from "luxon";

const AdmissionCountDown = ({ endTime: endTimeString }) => {
  const [timeDiff, setTimeDiff] = useState(calcTimeDiff());

  const endTime = DateTime.fromISO(endTimeString);

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
    const time = endTime.toRelative();

    // If it's 1 day left we would like to say 'i morgen' and not 1 day
    const isTomorrow = DateTime.now().plus({ days: 1 }).hasSame(endTime, "day");
    return isTomorrow ? "i morgen" : time;
  };

  return (
    <p style={{ alignContent: "center" }}>
      Opptaket {DateTime.now() < endTime ? "åpner " : "åpnet for "}
      {timeDiff}
    </p>
  );
};

export default AdmissionCountDown;
