import React, { PropsWithChildren } from "react";
import { useQueryClient } from "@tanstack/react-query";
import AbakusLogo from "src/components/AbakusLogo";
import { isLoggedIn, isManager } from "src/utils/djangoData";
import LinkButton from "src/components/LinkButton";
import { handleSensitiveLogoutLink } from "src/query/sensitiveActorSync";

const LandingPageSkeleton: React.FC<PropsWithChildren> = ({ children }) => {
  const queryClient = useQueryClient();

  return (
    <div className="mx-auto flex min-h-viewport w-full max-w-page flex-col items-center px-8 py-16 handheld:px-0 handheld:py-8">
      <div className="mb-8 max-w-44 handheld:max-w-36">
        <AbakusLogo />
      </div>
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
            onClick={(event) => handleSensitiveLogoutLink(queryClient, event)}
          >
            Logg ut
          </a>
        )}
      </div>
    </div>
  );
};

export default LandingPageSkeleton;
