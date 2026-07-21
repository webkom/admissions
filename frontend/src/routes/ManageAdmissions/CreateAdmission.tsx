import React from "react";
import styled from "styled-components";

import { StyledButton } from "src/components/LinkButton";
import LoadingBall from "src/components/LoadingBall";
import { breakpoints } from "src/styles/designTokens";
import { getApiErrorMessage } from "src/utils/apiErrors";

import AdmissionDetailsSections from "./components/AdmissionDetailsSections";
import AdmissionReviewSections from "./components/AdmissionReviewSections";
import { useAdmissionEditor } from "./useAdmissionEditor";

const CreateAdmission = () => {
  const editor = useAdmissionEditor();

  if (!editor.isNew && editor.load.isLoading) return <LoadingBall />;

  if (!editor.isNew && (editor.load.error || !editor.admission)) {
    const notFound = editor.load.error?.response?.status === 404;
    return (
      <LoadState role="alert">
        <h2>
          {notFound ? "Opptaket finnes ikke" : "Kunne ikke laste opptaket"}
        </h2>
        <p>
          {notFound
            ? `Fant ikke opptaket ${editor.admissionSlug}.`
            : editor.load.error
              ? getApiErrorMessage(
                  editor.load.error,
                  "Prøv å laste opptaket på nytt.",
                )
              : "Prøv å laste opptaket på nytt."}
        </p>
        {!notFound && (
          <StyledButton type="button" onClick={() => void editor.load.retry()}>
            Prøv igjen
          </StyledButton>
        )}
      </LoadState>
    );
  }

  return (
    <Form
      ref={editor.form.ref}
      onSubmit={editor.form.formik.handleSubmit}
      noValidate
    >
      <FormHeader>
        <Title>
          {editor.isNew ? "Opprett nytt opptak" : editor.admission?.title}
        </Title>
        <Lead>
          {editor.isNew
            ? "Sett opp grunninformasjon, tidsrom, tilgang og spørsmål. Kontroller sammendraget før opptaket opprettes."
            : "Oppdater innstillingene og kontroller sammendraget før du lagrer."}
        </Lead>
      </FormHeader>

      {(editor.form.errorItems.length > 0 ||
        editor.save.status?.type === "error") && (
        <ValidationSummary
          id="admission-error-summary"
          role="alert"
          tabIndex={-1}
          aria-labelledby="admission-error-summary-title"
        >
          <ValidationTitle id="admission-error-summary-title">
            Opptaket kunne ikke lagres
          </ValidationTitle>
          {editor.save.status?.type === "error" && (
            <ValidationMessage>{editor.save.status.message}</ValidationMessage>
          )}
          {editor.form.errorItems.length > 0 && (
            <>
              <ValidationMessage>
                Rett følgende før du prøver igjen:
              </ValidationMessage>
              <ValidationList>
                {editor.form.errorItems.map((item) => (
                  <li key={item.field}>
                    <ErrorLink
                      href={`#${item.targetId}`}
                      onClick={(event) => {
                        event.preventDefault();
                        editor.form.focusField(item.field);
                      }}
                    >
                      {item.label}: {item.message}
                    </ErrorLink>
                  </li>
                ))}
              </ValidationList>
            </>
          )}
        </ValidationSummary>
      )}

      <AdmissionDetailsSections
        formik={editor.form.formik}
        fieldError={editor.form.fieldError}
        isNew={editor.isNew}
        updateTitle={editor.form.updateTitle}
        updateSlug={editor.form.updateSlug}
      />

      <AdmissionReviewSections
        isNew={editor.isNew}
        reviewItems={editor.reviewItems}
        isSaving={editor.save.isPending}
        isDeleting={editor.deletion.isPending}
        hasUnsavedChanges={editor.form.hasUnsavedChanges}
        saveStatus={
          editor.save.status?.type === "success"
            ? editor.save.status
            : undefined
        }
        deleteStatus={editor.deletion.status}
        canDelete={editor.deletion.canDelete}
        onDelete={editor.deletion.run}
      />
    </Form>
  );
};

export default CreateAdmission;

const Form = styled.form`
  width: min(100%, var(--content-width-wide));
  padding: 0 var(--spacing-xl) var(--spacing-5xl);

  @media screen and (max-width: ${breakpoints.handheld}) {
    padding-inline: var(--spacing-md);
  }
`;

const FormHeader = styled.header`
  padding: var(--spacing-md) 0 var(--spacing-2xl);
`;

const Title = styled.h1`
  margin: 0;
  font-size: var(--font-size-xl);
`;

const Lead = styled.p`
  max-width: var(--content-width-readable);
  margin: var(--spacing-md) 0 0;
  color: var(--color-text-muted);
  line-height: var(--line-height-relaxed);
`;

const ValidationSummary = styled.div`
  margin-bottom: var(--spacing-xl);
  padding: var(--spacing-md) var(--spacing-lg);
  border: var(--border-width-default) solid var(--color-danger-border);
  border-radius: var(--border-radius-md);
  background: var(--color-danger-bg);
  color: var(--color-danger);
  font-size: var(--font-size-sm);

  &:focus {
    outline: var(--focus-ring-width) solid var(--color-brand-ring);
    outline-offset: var(--focus-ring-offset);
  }
`;

const ValidationTitle = styled.h2`
  margin: 0;
  font-size: var(--font-size-md);
`;

const ValidationMessage = styled.p`
  margin: var(--spacing-sm) 0 0;
`;

const ValidationList = styled.ul`
  margin: var(--spacing-sm) 0 0;
  padding-left: var(--spacing-xl);
`;

const ErrorLink = styled.a`
  color: inherit;
  font-weight: var(--font-weight-semibold);
  text-decoration: underline;
  text-underline-offset: var(--spacing-xs);
`;

const LoadState = styled.div`
  max-width: var(--content-width-form);
  margin: var(--spacing-3xl);
  padding: var(--spacing-xl);
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-base);

  h2 {
    margin-top: 0;
  }
`;
