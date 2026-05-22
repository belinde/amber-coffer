import { CardGrid, EntityCard, PageCard, SessionCard, SiteShell } from '@amber/ui';
import type { ReactElement } from 'react';

import type { PublicCanonPayload } from './public-canon-payload.schema.js';

function PublicLayout({
  campaignTitle,
  children,
}: {
  campaignTitle: string;
  children: ReactElement;
}): ReactElement {
  return (
    <SiteShell
      sidebar={
        <nav className="site-sidebar-nav" aria-label="Sections">
          <a href="index.html">Home</a>
          <a href="personaggi/index.html">Characters</a>
          <a href="resoconti/index.html">Sessions</a>
        </nav>
      }
    >
      <PageCard>
        <header className="page-header">
          <p className="eyebrow">{campaignTitle}</p>
        </header>
        {children}
      </PageCard>
    </SiteShell>
  );
}

export function renderHomePage(payload: PublicCanonPayload): ReactElement {
  return (
    <PublicLayout campaignTitle={payload.campaignTitle}>
      <div>
        <h1>{payload.campaignTitle}</h1>
        {payload.tagline ? <p className="home-tagline">{payload.tagline}</p> : null}
        <p>
          <a href="personaggi/index.html">Browse characters</a>
        </p>
      </div>
    </PublicLayout>
  );
}

export function renderCharactersHub(payload: PublicCanonPayload): ReactElement {
  return (
    <PublicLayout campaignTitle={payload.campaignTitle}>
      <div>
        <h1>Characters</h1>
        <CardGrid variant="portrait">
          {payload.characters.map((character) => (
            <li key={character.slug}>
              <EntityCard
                title={character.title}
                href={`../personaggi/${character.slug}/index.html`}
                meta={character.meta}
                excerpt={character.excerpt}
                portrait
              />
            </li>
          ))}
        </CardGrid>
      </div>
    </PublicLayout>
  );
}

export function renderCharacterDetail(
  payload: PublicCanonPayload,
  slug: string,
): ReactElement | null {
  const character = payload.characters.find((c) => c.slug === slug);
  if (!character) return null;

  return (
    <PublicLayout campaignTitle={payload.campaignTitle}>
      <article>
        <h1>{character.title}</h1>
        {character.meta ? <p className="card-meta">{character.meta}</p> : null}
        {character.excerpt ? <p>{character.excerpt}</p> : null}
      </article>
    </PublicLayout>
  );
}

export function renderSessionsHub(payload: PublicCanonPayload): ReactElement {
  return (
    <PublicLayout campaignTitle={payload.campaignTitle}>
      <div>
        <h1>Sessions</h1>
        <CardGrid>
          {payload.sessions.map((session) => (
            <li key={session.slug}>
              <SessionCard
                title={session.title}
                href={`../resoconti/${session.slug}/index.html`}
                badge={session.badge}
                meta={session.meta}
                excerpt={session.excerpt}
              />
            </li>
          ))}
        </CardGrid>
      </div>
    </PublicLayout>
  );
}
