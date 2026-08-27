import React, { useState } from "react";
import styled from "styled-components";
import { Link, Route, Routes } from "react-router-dom";
import { AxiosError } from "axios";
import { ArrowLeft, ShieldCheck, Trash2 } from "lucide-react";

import LinkButton, { StyledButton } from "src/components/LinkButton";
import LoadingBall from "src/components/LoadingBall";
import { GodUser } from "src/types";
import { useAddGodUser, useGodUsers, useRemoveGodUser } from "src/query/hooks";
import { breakpoints, iconSizes } from "src/styles/designTokens";
import { getApiErrorMessage } from "src/utils/apiErrors";

const ManageGodUsers: React.FC = () => {
  const { data, isFetching, error, refetch } = useGodUsers();

  if (error) {
    const status = error.response?.status;
    const isForbidden = status === 401 || status === 403;
    return (
      <PageState role="alert">
        {isForbidden ? (
          <>
            <h1>Du har ikke tilgang til god-brukerne</h1>
            <p>
              Bare Webkom-medlemmer kan administrere god-brukerne. Hvis du
              nettopp ble lagt til i Webkom, logg ut og logg inn igjen for å
              oppdatere tilgangen din.
            </p>
            <a href="/logout/">
              <StyledButton type="button">
                Logg ut og logg inn igjen
              </StyledButton>
            </a>
          </>
        ) : (
          <>
            <h1>Kunne ikke laste god-brukerne</h1>
            <p>{getApiErrorMessage(error, "Prøv å laste siden på nytt.")}</p>
            <StyledButton type="button" onClick={() => refetch()}>
              Prøv igjen
            </StyledButton>
          </>
        )}
      </PageState>
    );
  }

  if (isFetching && !data) {
    return (
      <PageState role="status" aria-label="Laster god-brukere">
        <LoadingBall />
      </PageState>
    );
  }

  return (
    <PageWrapper>
      <Header>
        <HeaderInner>
          <div>
            <HeaderTitle>God-brukere</HeaderTitle>
            <HeaderDescription>
              Legg til eller fjern LEGO-id for sentrale admin-brukere. Disse ser
              søknader og priority-tekst for alle opptak.
            </HeaderDescription>
          </div>
          <BackLink to="/manage/">
            <ArrowLeft size={iconSizes.standard} aria-hidden="true" />
            Tilbake til Administrer opptak
          </BackLink>
        </HeaderInner>
      </Header>
      <Main>
        <Content>
          <Routes>
            <Route index element={<GodUsersView godUsers={data ?? []} />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Content>
      </Main>
    </PageWrapper>
  );
};

const GodUsersView: React.FC<{ godUsers: GodUser[] }> = ({ godUsers }) => {
  return (
    <Pane>
      <AddForm />
      <List
        items={godUsers}
        renderItem={(entry) => (
          <Row key={entry.lego_id}>
            <RowBody>
              <LegoId>{entry.lego_id}</LegoId>
              {entry.note ? (
                <Note>{entry.note}</Note>
              ) : (
                <NoteEmpty>Ingen notat</NoteEmpty>
              )}
              <Meta>
                Lagt til av {entry.added_by_username || "ukjent"} den{" "}
                {new Date(entry.created_at).toLocaleString("nb-NO")}
              </Meta>
            </RowBody>
            <Actions>
              <RemoveButton legoId={entry.lego_id} />
            </Actions>
          </Row>
        )}
      />
    </Pane>
  );
};

const AddForm: React.FC = () => {
  const [legoId, setLegoId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const addGodUser = useAddGodUser();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = Number(legoId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError("LEGO-id må være et positivt heltall.");
      return;
    }
    try {
      await addGodUser.mutateAsync({ lego_id: parsed, note: note.trim() });
      setLegoId("");
      setNote("");
    } catch (err) {
      setError(
        getApiErrorMessage(
          err as AxiosError,
          "Kunne ikke legge til god-bruker.",
        ),
      );
    }
  };

  return (
    <FormCard onSubmit={submit}>
      <FormHeader>
        <ShieldCheck size={iconSizes.standard} aria-hidden="true" />
        <h2>Legg til god-bruker</h2>
      </FormHeader>
      <FieldRow>
        <Field>
          <Label htmlFor="god-lego-id">LEGO-id</Label>
          <Input
            id="god-lego-id"
            type="number"
            min="1"
            value={legoId}
            onChange={(e) => setLegoId(e.target.value)}
            placeholder="f.eks. 8810"
            required
          />
        </Field>
        <Field>
          <Label htmlFor="god-note">Notat (valgfritt)</Label>
          <Input
            id="god-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Hvorfor legger du denne til?"
          />
        </Field>
        <SubmitButton type="submit" disabled={addGodUser.isPending}>
          {addGodUser.isPending ? "Legger til…" : "Legg til"}
        </SubmitButton>
      </FieldRow>
      {error && <FormError role="alert">{error}</FormError>}
    </FormCard>
  );
};

const RemoveButton: React.FC<{ legoId: number }> = ({ legoId }) => {
  const removeGodUser = useRemoveGodUser();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doRemove = async () => {
    try {
      await removeGodUser.mutateAsync(legoId);
    } catch (err) {
      setError(
        getApiErrorMessage(err as AxiosError, "Kunne ikke fjerne god-bruker."),
      );
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <ConfirmWrap>
        <StyledButton type="button" onClick={() => setConfirming(false)}>
          Avbryt
        </StyledButton>
        <ConfirmButton
          type="button"
          onClick={doRemove}
          disabled={removeGodUser.isPending}
        >
          {removeGodUser.isPending ? "Fjerner…" : `Fjern ${legoId}?`}
        </ConfirmButton>
        {error && <FormError role="alert">{error}</FormError>}
      </ConfirmWrap>
    );
  }

  return (
    <IconButton
      type="button"
      onClick={() => setConfirming(true)}
      aria-label={`Fjern god-bruker ${legoId}`}
    >
      <Trash2 size={iconSizes.small} aria-hidden="true" />
    </IconButton>
  );
};

const List: React.FC<{
  items: GodUser[];
  renderItem: (entry: GodUser) => React.ReactNode;
}> = ({ items, renderItem }) => {
  if (items.length === 0) {
    return (
      <EmptyState>
        <ShieldCheck size={iconSizes.feature} aria-hidden="true" />
        <h3>Ingen god-brukere</h3>
        <p>
          Listen er tom. Legg til en LEGO-id over for å gi en bruker
          organisasjonsomfattende admin-tilgang.
        </p>
      </EmptyState>
    );
  }
  return <ListContainer>{items.map(renderItem)}</ListContainer>;
};

const NotFound: React.FC = () => (
  <Pane>
    <p>Ukjent underside.</p>
    <LinkButton to="/god-users/">Tilbake</LinkButton>
  </Pane>
);

export default ManageGodUsers;

const PageWrapper = styled.div`
  min-height: var(--viewport-min-height);
  background: var(--color-surface-base);
`;

const Header = styled.header`
  width: 100%;
  padding: var(--spacing-xl);
  border-bottom: var(--border-width-default) solid var(--color-border-soft);
  background: var(--color-surface-page);
`;

const HeaderInner = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--spacing-xl);
  max-width: var(--content-width-page);
  margin: 0 auto;

  @media screen and (max-width: ${breakpoints.handheld}) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const HeaderTitle = styled.h1`
  margin: 0;
  font-size: var(--font-size-heading-md);
`;

const HeaderDescription = styled.p`
  margin: var(--spacing-xs) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  max-width: 60ch;
`;

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
`;

const Main = styled.main`
  max-width: var(--content-width-form);
  margin: 0 auto;
  padding: var(--spacing-2xl) 0;
`;

const Content = styled.div`
  min-width: 0;
`;

const Pane = styled.section`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xl);
  padding: var(--spacing-md) 0;
`;

const FormCard = styled.form`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-xl);
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-lg);
  background: var(--color-surface-card);
`;

const FormHeader = styled.div`
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);

  h2 {
    margin: 0;
    font-size: var(--font-size-heading-sm);
  }
`;

const FieldRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto;
  gap: var(--spacing-md);
  align-items: end;

  @media screen and (max-width: ${breakpoints.handheld}) {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
`;

const Label = styled.label`
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
`;

const Input = styled.input`
  padding: var(--spacing-sm) var(--spacing-md);
  border: var(--border-width-default) solid var(--color-border-strong);
  border-radius: var(--border-radius-md);
  font-size: var(--font-size-sm);
  background: var(--color-surface-base);
`;

const SubmitButton = styled(StyledButton)`
  align-self: end;
`;

const FormError = styled.p`
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  margin: 0;
`;

const ListContainer = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
`;

const Row = styled.li`
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-card);
`;

const RowBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  flex: 1;
  min-width: 0;
`;

const LegoId = styled.span`
  font-family: var(--font-family-mono, monospace);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-strong);
`;

const Note = styled.span`
  font-size: var(--font-size-sm);
  color: var(--color-text-body);
`;

const NoteEmpty = styled.span`
  color: var(--color-text-muted);
  font-style: italic;
`;

const Meta = styled.span`
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
`;

const IconButton = styled(StyledButton)`
  padding: var(--spacing-sm);
  color: var(--color-danger);
`;

const ConfirmWrap = styled.div`
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
`;

const ConfirmButton = styled(StyledButton)`
  background: var(--color-danger);
  color: var(--color-text-on-danger, #fff);
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-2xl) var(--spacing-xl);
  border: var(--border-width-default) dashed var(--color-border-soft);
  border-radius: var(--border-radius-lg);
  background: var(--color-surface-card);
  text-align: center;
  color: var(--color-text-muted);

  h3 {
    margin: 0;
    color: var(--color-text-primary);
  }
`;

const PageState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-md);
  max-width: var(--content-width-form);
  margin: var(--spacing-3xl) auto;
  padding: var(--spacing-xl);

  h1,
  p {
    margin: 0;
  }
`;
