import React from "react";
import { isLoggedIn } from "src/utils/djangoData";
import { AdmissionList } from "src/types";
import AdmissionTimeline, {
  type AdmissionTimelineItem,
} from "src/components/AdmissionTimeline";
import CountDown from "./CountDown";
import LinkButton from "src/components/LinkButton";
import cn from "src/utils/cn";
import { Calendar, Send, Settings } from "lucide-react";
import { iconSizes } from "src/styles/designTokens";

interface AdmissionProps {
  admission: AdmissionList;
}

const baseActionButtonClass =
  "!min-h-14 !box-border !rounded-md !font-bold !transition-[background-color,border-color,color,transform,box-shadow] !duration-200";

const primaryActionButtonClass = cn(
  baseActionButtonClass,
  "!min-h-16 !border !border-solid !border-brand-outline !bg-brand !text-action !text-white hover:!bg-brand-hover active:!translate-y-0 disabled:!cursor-not-allowed disabled:!opacity-50 disabled:hover:!bg-brand",
);

const secondaryActionButtonClass = cn(
  baseActionButtonClass,
  "!border !border-solid !border-border-strong !bg-surface-base !text-sm !text-text-primary hover:!bg-surface-neutral",
);

const Admission: React.FC<AdmissionProps> = ({ admission }) => {
  const isRevy = admission.slug === "revy";
  const isRevyBoard = admission.slug === "revystyret";
  const isBackup = admission.slug === "backup";
  const isSingleGroupAdmission = admission.groups.length === 1;
  const adminPanelPath = isSingleGroupAdmission
    ? `/${admission.slug}/admin/?group=${encodeURIComponent(admission.groups[0])}`
    : `/${admission.slug}/admin/`;
  const isAdmissionMember =
    (admission.userdata.committee_groups?.length ?? 0) > 0;
  const isPrivileged = admission.userdata.is_privileged;
  const isRecruiter = admission.userdata.is_recruiter;
  const isAdmin = admission.userdata.is_admin;
  const canAccessAdminPanel = isPrivileged || isAdmin || isRecruiter;
  const timelineItems: AdmissionTimelineItem[] = [
    {
      title: "Opptaket åpner",
      dateString: admission.open_from,
      details: [],
    },
    {
      title: "Søknadsfrist",
      dateString: admission.public_deadline,
      details: ["Alle søknader er garantert å bli behandlet."],
    },
    {
      title: "Redigeringsfrist",
      dateString: admission.closed_from,
      details: ["Siste frist for redigering og nye søknader."],
    },
  ];

  const now = new Date();
  const nextCountDown = (() => {
    if (new Date(admission.open_from) > now)
      return {
        title: "Opptaket åpner",
        dateString: admission.open_from,
      };
    if (new Date(admission.public_deadline) > now)
      return {
        title: "Søknadsfrist",
        dateString: admission.public_deadline,
      };
    if (new Date(admission.closed_from) > now)
      return {
        title: "Redigeringsfrist",
        dateString: admission.closed_from,
      };
    return {
      title: "Opptaket er avsluttet",
      dateString: admission.closed_from,
    };
  })();

  return (
    <div className="mt-10 w-full max-w-page rounded-panel border border-border bg-surface-base p-12 shadow-panel transition-shadow duration-200 hover:shadow-panel-hover narrow:p-10 handheld:mt-6 handheld:rounded-none handheld:border-x-0 handheld:p-6">
      <div className="mb-8 grid grid-cols-admission-overview gap-10 narrow:grid-cols-1 narrow:gap-8">
        <div>
          <h2 className="m-0 mb-3 text-display-lg font-extrabold tracking-display-tight text-text-strong text-balance handheld:text-display-md">
            {admission.title}
          </h2>
          {admission.description && (
            <p className="mb-8 text-body-lg leading-relaxed text-text-body handheld:mb-6 handheld:text-base">
              {admission.description
                .split("\n")
                .map((descriptionLine, index) => (
                  <React.Fragment key={index}>
                    {descriptionLine}
                    <br />
                  </React.Fragment>
                ))}
            </p>
          )}
          <AdmissionTimeline items={timelineItems} />
        </div>

        <aside className="flex flex-col justify-start">
          {nextCountDown && (
            <CountDown
              title={nextCountDown.title}
              dateString={nextCountDown.dateString}
            />
          )}

          <div className="mt-4 flex w-full flex-col gap-3">
            {(admission.is_open || admission.userdata.has_application) && (
              <LinkButton
                className={primaryActionButtonClass}
                fullWidth
                to={
                  isLoggedIn()
                    ? `/${admission.slug}/` +
                      (admission.userdata.has_application ||
                      isSingleGroupAdmission
                        ? "min-soknad"
                        : "velg-grupper")
                    : "/login/lego/"
                }
                external={!isLoggedIn()}
                disabled={!isLoggedIn() && !admission.is_open}
              >
                <ActionButtonContent
                  icon={<Send size={iconSizes.feature} aria-hidden="true" />}
                  label="Gå til søknad"
                />
              </LinkButton>
            )}

            <div className="flex w-full flex-col items-stretch gap-2">
              {isAdmissionMember && (
                <LinkButton
                  className={secondaryActionButtonClass}
                  fullWidth
                  to={`/${admission.slug}/schedule/`}
                >
                  <ActionButtonContent
                    icon={
                      <Calendar size={iconSizes.standard} aria-hidden="true" />
                    }
                    // This one link covers the whole lifecycle of the page it
                    // opens - submitting your own availability before a plan
                    // exists, watching it get built, and (for most members)
                    // just seeing the published result. "Velg intervjutider"
                    // only describes the first of those and reads as stale or
                    // wrong once a plan is underway or already out.
                    label="Intervjuoversikt"
                  />
                </LinkButton>
              )}
            </div>

            <div className="flex w-full flex-col items-stretch gap-2">
              {canAccessAdminPanel && (
                <LinkButton
                  className={secondaryActionButtonClass}
                  fullWidth
                  to={adminPanelPath}
                >
                  <ActionButtonContent
                    icon={
                      <Settings size={iconSizes.standard} aria-hidden="true" />
                    }
                    label="Admin panel"
                  />
                </LinkButton>
              )}
            </div>
          </div>
        </aside>
      </div>

      <p className="m-0 border-t border-border pt-6 text-sm text-text-faded [&_a]:font-semibold [&_a]:text-text-secondary [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-text-strong">
        Du kan til enhver tid trekke søknaden din hvis du skulle ombestemme deg.
        Hvis det ikke fungerer å slette søknaden, send en mail til{" "}
        {isRevy || isRevyBoard ? (
          <a href="mailto:revysjef@abakus.no">revysjef@abakus.no</a>
        ) : isBackup ? (
          <a href="mailto:backup-rekruttering@abakus.no">
            backup-rekruttering@abakus.no
          </a>
        ) : (
          <a href="mailto:leder@abakus.no">leder@abakus.no</a>
        )}
        .
      </p>

      {isRevy && admission.is_open && !isLoggedIn() && (
        <p className="m-0 pt-4 text-sm text-text-faded [&_a]:font-semibold [&_a]:text-text-secondary [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-text-strong">
          Er du ikke medlem av Abakus? Søk via{" "}
          <a href="https://forms.gle/MYrhBBzZCm5gws2t6">dette skjemaet</a>.
        </p>
      )}
      {isRevyBoard && admission.is_open && !isLoggedIn() && (
        <p className="m-0 pt-4 text-sm text-text-faded [&_a]:font-semibold [&_a]:text-text-secondary [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-text-strong">
          Er du ikke medlem av Abakus? Søk via{" "}
          <a href="https://forms.gle/MYrhBBzZCm5gws2t6">dette skjemaet</a>.
        </p>
      )}
    </div>
  );
};

interface ActionButtonContentProps {
  icon: React.ReactNode;
  label: string;
}

const ActionButtonContent = ({ icon, label }: ActionButtonContentProps) => (
  <span className="grid w-full grid-cols-[var(--spacing-2xl)_minmax(0,1fr)_var(--spacing-2xl)] items-center">
    <span className="inline-flex h-5 w-5 items-center justify-center">
      {icon}
    </span>
    <span className="text-center">{label}</span>
    <span className="invisible h-5 w-5" />
  </span>
);

export default Admission;
