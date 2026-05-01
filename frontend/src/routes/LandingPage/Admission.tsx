import React from "react";
import { isLoggedIn } from "src/utils/djangoData";
import { Admission as AdmissionInterface } from "src/types";
import AdmissionTimeline, {
  type AdmissionTimelineItem,
} from "src/components/AdmissionTimeline";
import CountDown from "./CountDown";
import LinkButton from "src/components/LinkButton";
import Icon from "src/components/Icon";
import cn from "src/utils/cn";

interface AdmissionProps {
  admission: AdmissionInterface;
}

const baseActionButtonClass =
  "!min-h-14 !box-border !rounded-[var(--border-radius-md)] !font-bold !transition-[background-color,border-color,color,transform,box-shadow] !duration-200";

const primaryActionButtonClass = cn(
  baseActionButtonClass,
  "slide-underline slide-underline--on-dark !min-h-[3.75rem] !border-2 !border-brand !bg-brand !text-action !text-white active:!translate-y-0 disabled:!cursor-not-allowed disabled:!opacity-50",
);

const secondaryActionButtonClass = cn(
  baseActionButtonClass,
  "slide-underline slide-underline--tight !border-2 !border-border-muted !bg-surface-base !text-sm !text-brand",
);

const Admission: React.FC<AdmissionProps> = ({ admission }) => {
  const isRevy = admission.slug === "revy";
  const isRevyBoard = admission.slug === "revystyret";
  const isBackup = admission.slug === "backup";
  const isSingleGroupAdmission = admission?.groups.length === 1;
  const isAdmissionMember =
    (admission.userdata.committee_groups?.length ?? 0) > 0;
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
        completedLabel: "Åpnet",
      };
    if (new Date(admission.public_deadline) > now)
      return {
        title: "Søknadsfrist",
        dateString: admission.public_deadline,
        completedLabel: "Søknadsfrist passert",
      };
    if (new Date(admission.closed_from) > now)
      return {
        title: "Redigeringsfrist",
        dateString: admission.closed_from,
        completedLabel: "Redigering stengt",
      };
    return null;
  })();

  return (
    <div className="mt-10 w-full max-w-6xl rounded-panel border border-border bg-surface-base p-10 shadow-panel transition-shadow duration-200 hover:shadow-panel-hover portrait:p-8 handheld:mt-6 handheld:p-5">
      <div className="mb-8 grid grid-cols-[1.4fr_1fr] gap-10 portrait:grid-cols-1 portrait:gap-8">
        <div>
          <h2 className="mb-3 text-display-lg font-extrabold tracking-tight text-text-strong handheld:text-display-md">
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
              completedLabel={nextCountDown.completedLabel}
            />
          )}

          <div className="mt-4 flex w-full flex-col gap-3">
            <div className="flex items-center justify-between gap-3 px-1"></div>
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
                  icon={<Icon name="paper-plane" size={20} />}
                  label="Gå til søknad"
                />
              </LinkButton>
            )}

            <div className="flex w-full flex-col items-stretch gap-2">
              {admission.userdata.is_recruiter && (
                <LinkButton
                  className={secondaryActionButtonClass}
                  fullWidth
                  to={`/${admission.slug}/admin/`}
                >
                  <ActionButtonContent
                    icon={<Icon name="settings" size={18} />}
                    label="Admin panel"
                  />
                </LinkButton>
              )}
            </div>

            <div className="flex w-full flex-col items-stretch gap-2">
              {isAdmissionMember && (
                <LinkButton
                  className={secondaryActionButtonClass}
                  fullWidth
                  to={`/${admission.slug}/schedule/`}
                >
                  <ActionButtonContent
                    icon={<Icon name="calendar" size={18} />}
                    label="Velg intervjutider"
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
          <a href="https://forms.gle/SKPRvGNwuKhcZQP26">dette skjemaet</a>.
        </p>
      )}
      {isRevyBoard && admission.is_open && !isLoggedIn() && (
        <p className="m-0 pt-4 text-sm text-text-faded [&_a]:font-semibold [&_a]:text-text-secondary [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-text-strong">
          Er du ikke medlem av Abakus? Søk via{" "}
          <a href="https://docs.google.com/forms/d/e/1FAIpQLSdLzkn2RC_CIW3EHPKSn0f60xTP17LdnrvVb1ubVeRVHTsz1A/viewform?usp=sharing">
            dette skjemaet
          </a>
          .
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
  <span className="grid w-full grid-cols-[1.25rem_minmax(0,1fr)_1.25rem] items-center">
    <span className="inline-flex h-5 w-5 items-center justify-center">
      {icon}
    </span>
    <span className="text-center">{label}</span>
    <span className="invisible h-5 w-5" />
  </span>
);

export default Admission;
