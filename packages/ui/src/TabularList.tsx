import type { ReactElement, ReactNode } from 'react';

import type { TabularListEntry, TabularListLabels } from './tabular-list.js';

export type { TabularListEntry, TabularListLabels, TabularListRow } from './tabular-list.js';
export { buildTabularRow } from './tabular-list.js';

type Props = {
  entries: TabularListEntry[];
  labels: TabularListLabels;
  showThumbnails?: boolean;
  onActivate?: (id: string) => void;
  renderActions?: (id: string) => ReactNode;
  renderThumbnail?: (entry: TabularListEntry) => ReactNode;
};

export function TabularList({
  entries,
  labels,
  showThumbnails = true,
  onActivate,
  renderActions,
  renderThumbnail,
}: Props): ReactElement {
  const interactive = Boolean(onActivate);
  const emptyDetails = labels.emptyDetails ?? '—';
  const showThumbColumn = showThumbnails && Boolean(renderThumbnail);

  return (
    <div
      className={showThumbColumn ? 'tabular-list' : 'tabular-list tabular-list--no-thumb'}
      role={interactive ? undefined : 'table'}
    >
      <div className="tabular-list-header" role="row">
        {showThumbColumn ? (
          <span className="tabular-list-col-thumb" role="columnheader">
            {labels.thumbnail}
          </span>
        ) : null}
        <span className="tabular-list-col-primary" role="columnheader">
          {labels.name}
        </span>
        <span className="tabular-list-col-details" role="columnheader">
          {labels.details}
        </span>
        {renderActions ? (
          <span className="tabular-list-col-actions" role="columnheader">
            {labels.actions}
          </span>
        ) : null}
      </div>
      <ul className="tabular-list-body">
        {entries.map((entry) => {
          const { id, row } = entry;
          const primary = (
            <>
              <span className="tabular-list-title">
                {row.title}
                {row.badge ? <span className="tabular-list-badge">{row.badge}</span> : null}
              </span>
              {row.subtitle ? <span className="tabular-list-subtitle">{row.subtitle}</span> : null}
            </>
          );

          const details =
            row.details && row.details.length > 0 ? (
              <ul className="tabular-list-details">
                {row.details.map((detail, index) => (
                  <li key={index}>{detail}</li>
                ))}
              </ul>
            ) : (
              <span className="tabular-list-details-empty">{emptyDetails}</span>
            );

          const mainCells = (
            <>
              {showThumbColumn && renderThumbnail ? (
                <span className="tabular-list-col-thumb">{renderThumbnail(entry)}</span>
              ) : null}
              <span className="tabular-list-col-primary">{primary}</span>
              <span className="tabular-list-col-details">{details}</span>
            </>
          );

          const rowClassName = renderActions
            ? 'tabular-list-row tabular-list-row--has-actions'
            : 'tabular-list-row';

          return (
            <li key={id} className={rowClassName}>
              {interactive ? (
                <button
                  type="button"
                  className="tabular-list-row-main"
                  onClick={() => onActivate?.(id)}
                >
                  {mainCells}
                </button>
              ) : (
                <div className="tabular-list-row-main">{mainCells}</div>
              )}
              {renderActions ? (
                <span className="tabular-list-col-actions">{renderActions(id)}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
