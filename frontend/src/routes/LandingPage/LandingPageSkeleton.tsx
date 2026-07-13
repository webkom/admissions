import React, { PropsWithChildren } from "react";
import AbakusLogo from "src/components/AbakusLogo";
import { isLoggedIn, isManager } from "src/utils/djangoData";
import LinkButton from "src/components/LinkButton";

const LandingPageSkeleton: React.FC<PropsWithChildren> = ({ children }) => {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col items-center px-8 py-16 handheld:px-4 handheld:py-8">
      <div className="mb-8 max-w-44 transition-transform duration-200 hover:scale-[1.02] handheld:max-w-36">
        <AbakusLogo />
      </div>
      <h1 className="mb-4 text-center text-[clamp(2.75rem,6vw,4rem)] font-extrabold tracking-display-tight text-text-strong handheld:text-display-lg">
        Opptak
      </h1>
      {children}
      {isManager() && (
        <div className="mt-16">
          <LinkButton to={`/manage/`}>Administrer opptak</LinkButton>
        </div>
      )}
      <div className="mt-24 flex w-full justify-center border-t border-border-soft pt-8 pb-8">
        {!isLoggedIn() ? (
          <a
            className="text-sm font-medium text-text-secondary transition-colors duration-200 hover:text-text-strong"
            href="/login/lego/"
          >
            Logg inn
          </a>
        ) : (
          <a
            className="text-sm font-medium text-text-secondary transition-colors duration-200 hover:text-text-strong"
            href="/logout/"
          >
            Logg ut
          </a>
        )}
      </div>
    </div>
  );
};

export default LandingPageSkeleton;
