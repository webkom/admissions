import React from "react";
import DecorativeLine from "src/components/DecorativeLine";
import LandingPageSkeleton from "./LandingPageSkeleton";
import LinkButton from "src/components/LinkButton";

const LandingPageNoAdmission = () => {
  return (
    <LandingPageSkeleton>
      <h2 className="mb-2 text-display-md font-medium text-text-gray7 handheld:mt-8 handheld:px-4 handheld:text-center handheld:text-display-sm handheld:leading-8">
        Ingen åpne opptak for øyeblikket
      </h2>
      <div className="mb-8 flex max-w-md handheld:mx-4">
        <DecorativeLine $vertical />
        <p className="mb-0 py-2 text-body-lg leading-7 handheld:text-base handheld:leading-6 [&_a]:whitespace-nowrap ml-2">
          Opptak til{" "}
          <a href="https://abakus.no/pages/grupper/104-revyen">revyen</a> og{" "}
          <a href="https://abakus.no/pages/komiteer/4">komiteene</a> skjer
          vanligvis i september etter semesterstart.{" "}
          <a href="https://abakus.no/pages/komiteer/5">backup</a> har vanligvis
          opptak i februar.
          <br />
          <br />
          Følg med på{" "}
          <a href="https://abakus.no" rel="noopener noreferrer">
            abakus.no
          </a>{" "}
          eller på{" "}
          <a
            href="https://www.facebook.com/AbakusNTNU/"
            rel="noopener noreferrer"
          >
            vår facebook side
          </a>{" "}
          for kunngjøringer!
        </p>
      </div>
      <LinkButton to="https://abakus.no" external>
        Gå til abakus.no
      </LinkButton>
    </LandingPageSkeleton>
  );
};

export default LandingPageNoAdmission;
