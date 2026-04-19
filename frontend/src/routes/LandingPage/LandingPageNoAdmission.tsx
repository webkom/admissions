import React from "react";
import DecorativeLine from "src/components/DecorativeLine";
import LandingPageSkeleton from "./LandingPageSkeleton";
import LinkButton from "src/components/LinkButton";

const LandingPageNoAdmission = () => {
  return (
    <LandingPageSkeleton>
      <h2 className="mb-[0.6rem] text-[1.8rem] font-medium text-[var(--color-gray-7)] max-[500px]:mt-8 max-[500px]:text-center max-[500px]:text-[1.5rem] max-[500px]:leading-8">
        Ingen åpne opptak for øyeblikket
      </h2>
      <div className="mb-8 flex max-w-[420px] max-[500px]:mx-4">
        <DecorativeLine $vertical />
        <p className="mb-0 px-0 py-[7px] text-[1.1rem] leading-[1.8rem] max-[500px]:text-base max-[500px]:leading-6 [&_a]:whitespace-nowrap">
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
      <LinkButton to="https://abakus.no" external secondary>
        Gå til abakus.no
      </LinkButton>
    </LandingPageSkeleton>
  );
};

export default LandingPageNoAdmission;
