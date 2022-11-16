import React, { useEffect, useState } from "react";
import { DateTime } from "luxon";

interface AdmissionCountDownProps {
  endTime: string;
}

const AdmissionCountDown: React.FC<AdmissionCountDownProps> = ({
  endTime: endTimeString,
}) => {
  const endTime = DateTime.fromISO(endTimeString);
  const calcTimeDiff = () => {
    const time = endTime.toRelative();

    // If it's 1 day left we would like to say 'i morgen' and not 1 day
    const isTomorrow = DateTime.now().plus({ days: 1 }).hasSame(endTime, "day");
    return isTomorrow ? "i morgen" : time;
  };

  const [timeDiff, setTimeDiff] = useState(calcTimeDiff());

  useEffect(() => {
    const updateTimeDiffInterval = setInterval(
      () => setTimeDiff(calcTimeDiff()),
      1000
    );
    return () => {
      clearInterval(updateTimeDiffInterval);
    };
  }, []);

  return (
    <p style={{ alignContent: "center" }}>
      Opptaket {DateTime.now() < endTime ? "åpner " : "åpnet for "}
      {timeDiff}
    </p>
  );
};

export default AdmissionCountDown;
