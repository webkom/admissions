import React, { PropsWithChildren } from "react";
import AbakusLogo from "src/components/AbakusLogo";
import { isLoggedIn, isManager } from "src/utils/djangoData";
import LinkButton from "src/components/LinkButton";

const LandingPageSkeleton: React.FC<PropsWithChildren> = ({ children }) => {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1200px] flex-col items-center px-8 py-16 max-[500px]:px-4 max-[500px]:py-8">
      <div className="mb-8 max-w-[180px] transition-[transform] duration-200 hover:scale-[1.02] max-[500px]:max-w-[140px]">
        <AbakusLogo />
      </div>
      <h1 className="mb-4 text-center text-[3rem] font-extrabold tracking-[-0.04em] text-[#111827] max-[500px]:text-[2rem]">
        Opptak
      </h1>
      {children}
      {isManager() && (
        <div className="mt-16">
          <LinkButton to={`/manage/`}>Administrer opptak</LinkButton>
        </div>
      )}
      <div className="mt-24 flex w-full justify-center border-t border-[#f3f4f6] pt-8 pb-8">
        {!isLoggedIn() ? (
          <a
            className="text-sm font-medium text-[#6b7280] transition-colors duration-200 hover:text-[#111827]"
            href="/login/lego/"
          >
            Logg inn
          </a>
        ) : (
          <a
            className="text-sm font-medium text-[#6b7280] transition-colors duration-200 hover:text-[#111827]"
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
