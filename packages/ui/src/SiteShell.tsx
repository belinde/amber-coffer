import type { ReactElement, ReactNode } from 'react';

type Props = {
  header?: ReactNode;
  sidebar: ReactNode;
  sidebarFooter?: ReactNode;
  children: ReactNode;
};

export function SiteShell({ header, sidebar, sidebarFooter, children }: Props): ReactElement {
  return (
    <>
      {header}
      <div className="site-shell app-shell">
        <aside className="site-sidebar app-sidebar">
          <div className="site-sidebar__body app-sidebar__body">{sidebar}</div>
          {sidebarFooter ? (
            <footer className="site-sidebar__footer app-sidebar__footer">{sidebarFooter}</footer>
          ) : null}
        </aside>
        <div className="site-content app-content">
          <main className="site-main app-main">
            <div className="content-wrap">{children}</div>
          </main>
        </div>
      </div>
    </>
  );
}
