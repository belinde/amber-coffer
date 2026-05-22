import type { ReactElement, ReactNode } from 'react';

type Props = {
  title: string;
  href: string;
  badge?: string | undefined;
  meta?: ReactNode;
  excerpt?: string | undefined;
  media?: ReactNode;
};

export function SessionCard({ title, href, badge, meta, excerpt, media }: Props): ReactElement {
  return (
    <article className="session-card">
      <a className="session-card-link" href={href}>
        {badge ? <span className="session-card-badge">{badge}</span> : null}
        {media ? <div className="session-card-media">{media}</div> : null}
        <div className="session-card-body">
          <h2 className="card-title">{title}</h2>
          {meta ? <p className="card-meta">{meta}</p> : null}
          {excerpt ? <p className="card-excerpt">{excerpt}</p> : null}
        </div>
      </a>
    </article>
  );
}
