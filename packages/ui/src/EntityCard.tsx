import type { ReactElement, ReactNode } from 'react';

type Props = {
  title: string;
  href?: string | undefined;
  onClick?: (() => void) | undefined;
  meta?: ReactNode;
  excerpt?: string | undefined;
  media?: ReactNode;
  portrait?: boolean;
};

function classNames(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function EntityCard({
  title,
  href,
  onClick,
  meta,
  excerpt,
  media,
  portrait = false,
}: Props): ReactElement {
  const body = (
    <>
      {media ? (
        <div className={classNames('entity-card-media', portrait && 'entity-card-media--portrait')}>
          {media}
        </div>
      ) : null}
      <div className="entity-card-body">
        <h2 className="card-title">{title}</h2>
        {meta ? <p className="card-meta">{meta}</p> : null}
        {excerpt ? <p className="card-excerpt">{excerpt}</p> : null}
      </div>
    </>
  );

  const cardClass = classNames('entity-card', portrait && 'entity-card--portrait');

  if (href) {
    return (
      <article className={cardClass}>
        <a className="entity-card-link" href={href}>
          {body}
        </a>
      </article>
    );
  }

  if (onClick) {
    return (
      <article className={cardClass}>
        <button type="button" className="entity-card-button" onClick={onClick}>
          {body}
        </button>
      </article>
    );
  }

  return <article className={cardClass}>{body}</article>;
}
