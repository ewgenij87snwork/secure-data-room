export function WorkspaceRouteSkeleton(): React.JSX.Element {
  return (
    <section
      className="workspace-content workspace-route-skeleton"
      data-testid="workspace-route-skeleton"
      aria-busy="true"
      aria-labelledby="workspace-title"
    >
      <h1 id="workspace-title" className="sr-only">
        Loading folder contents
      </h1>
      <span className="sr-only" role="status">
        Loading folder contents
      </span>
      <div className="content-skeleton content-skeleton--breadcrumb" aria-hidden="true" />
      <div className="workspace-heading workspace-route-skeleton__heading" aria-hidden="true">
        <div>
          <div className="content-skeleton content-skeleton--eyebrow" />
          <div className="content-skeleton content-skeleton--title" />
        </div>
        <div className="workspace-route-skeleton__actions">
          <div className="content-skeleton content-skeleton--button" />
          <div className="content-skeleton content-skeleton--button content-skeleton--button-short" />
        </div>
      </div>
      <div className="content-skeleton-table" aria-hidden="true">
        <div className="content-skeleton-table__header" />
        <div className="content-skeleton-table__row" />
        <div className="content-skeleton-table__row" />
        <div className="content-skeleton-table__row" />
      </div>
    </section>
  );
}
