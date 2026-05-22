import type { Campaign } from '@amber/shared';
import type { ReactElement, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/Button.js';
import { ActionIcons } from '../../components/ui/icons.js';
import { buildTabularRow, type TabularListRow } from '../../components/ui/tabular-list.js';
import { TabularList } from '../../components/ui/TabularList.js';
import { ErrorOutlet } from '../../context/AppErrorContext.js';

type View = 'list' | 'create' | 'edit';

type Props<T extends { id: string }> = {
  listTitleKey: string;
  createKey: string;
  emptyKey: string;
  deleteConfirmKey: string;
  hideDelete?: boolean;
  canDelete?: (item: T) => boolean;
  listFn: () => Promise<T[]>;
  deleteFn: (id: T['id']) => Promise<void>;
  getLabel: (item: T) => string;
  getMeta?: (item: T) => string;
  getListRow?: (item: T) => TabularListRow;
  showThumbnails?: boolean;
  campaignId?: Campaign['id'];
  /** When set, list rows open the detail view instead of inline edit. */
  onOpenItem?: (item: T) => void;
  openItemKey?: string;
  onError: (message: string) => void;
  renderEditor: (props: {
    item: T | null;
    onSaved: (item: T) => void;
    onCancel: () => void;
    onError: (message: string) => void;
  }) => ReactNode;
};

export function CrudPanel<T extends { id: string }>({
  listTitleKey,
  createKey,
  emptyKey,
  deleteConfirmKey,
  hideDelete = false,
  canDelete,
  listFn,
  deleteFn,
  getLabel,
  getMeta,
  getListRow,
  showThumbnails = false,
  campaignId,
  onOpenItem,
  openItemKey = 'common.open',
  onError,
  renderEditor,
}: Props<T>): ReactElement {
  const { t } = useTranslation();
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<T | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listFn());
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [listFn, onError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function handleSaved(item: T): void {
    setView('list');
    setEditing(null);
    setItems((prev) => {
      const idx = prev.findIndex((r) => r.id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = item;
        return next.sort((a, b) => getLabel(a).localeCompare(getLabel(b)));
      }
      return [...prev, item].sort((a, b) => getLabel(a).localeCompare(getLabel(b)));
    });
  }

  async function handleDelete(item: T): Promise<void> {
    if (!window.confirm(t(deleteConfirmKey, { name: getLabel(item) }))) return;
    try {
      await deleteFn(item.id);
      setItems((prev) => prev.filter((r) => r.id !== item.id));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  function rowFor(item: T): TabularListRow {
    if (getListRow) return getListRow(item);
    const meta = getMeta?.(item);
    return buildTabularRow({
      title: getLabel(item),
      subtitle: meta,
      details: meta ? [meta] : undefined,
    });
  }

  if (view === 'create') {
    return (
      <>
        {renderEditor({
          item: null,
          onSaved: handleSaved,
          onCancel: () => setView('list'),
          onError,
        })}
      </>
    );
  }

  if (view === 'edit' && editing) {
    return (
      <>
        {renderEditor({
          item: editing,
          onSaved: handleSaved,
          onCancel: () => {
            setView('list');
            setEditing(null);
          },
          onError,
        })}
      </>
    );
  }

  return (
    <section>
      <header className="panel-header">
        <h2>{t(listTitleKey)}</h2>
        <Button
          type="button"
          variant="primary"
          icon={ActionIcons.add}
          onClick={() => setView('create')}
        >
          {t(createKey)}
        </Button>
      </header>
      <ErrorOutlet region="main" />

      {loading ? <p className="empty-state">{t('common.loading')}</p> : null}
      {!loading && items.length === 0 ? <p className="empty-state">{t(emptyKey)}</p> : null}

      {!loading && items.length > 0 ? (
        <TabularList
          showThumbnails={showThumbnails}
          {...(campaignId ? { campaignId } : {})}
          entries={items.map((item) => ({ id: item.id, row: rowFor(item) }))}
          {...(onOpenItem
            ? {
                onActivate: (id: string) => {
                  const row = items.find((r) => r.id === id);
                  if (row) onOpenItem(row);
                },
              }
            : {})}
          renderActions={(id) => {
            const item = items.find((r) => r.id === id);
            if (!item) return null;
            return (
              <>
                {onOpenItem ? (
                  <Button
                    type="button"
                    variant="primary"
                    icon={ActionIcons.open}
                    onClick={() => onOpenItem(item)}
                  >
                    {t(openItemKey)}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    icon={ActionIcons.edit}
                    onClick={() => {
                      setEditing(item);
                      setView('edit');
                    }}
                  >
                    {t('common.edit')}
                  </Button>
                )}
                {hideDelete || canDelete?.(item) === false ? null : (
                  <Button
                    type="button"
                    variant="danger"
                    icon={ActionIcons.delete}
                    onClick={() => void handleDelete(item)}
                  >
                    {t('common.delete')}
                  </Button>
                )}
              </>
            );
          }}
        />
      ) : null}
    </section>
  );
}
