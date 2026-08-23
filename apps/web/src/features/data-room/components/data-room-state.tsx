type DataRoomStateProps =
  | Readonly<{ kind: 'loading'; label: string }>
  | Readonly<{ kind: 'empty'; eyebrow?: string; title: string; message: string }>
  | Readonly<{
      kind: 'error';
      title: string;
      message: string;
      onRetry?: (() => void) | undefined;
    }>;

export function DataRoomState(props: DataRoomStateProps): React.JSX.Element {
  if (props.kind === 'loading') {
    return (
      <div className="data-room-state data-room-state--loading" role="status" aria-busy="true">
        <span className="sr-only">{props.label}</span>
        <div className="content-skeleton-table content-skeleton-table--inline" aria-hidden="true">
          <div className="content-skeleton-table__header" />
          <div className="content-skeleton-table__row" />
          <div className="content-skeleton-table__row" />
          <div className="content-skeleton-table__row" />
        </div>
      </div>
    );
  }
  return (
    <section
      className={`data-room-state data-room-state--${props.kind}`}
      {...(props.kind === 'error' ? { role: 'alert' } : {})}
    >
      {'eyebrow' in props && props.eyebrow ? <p className="eyebrow">{props.eyebrow}</p> : null}
      <h2>{props.title}</h2>
      <p>{props.message}</p>
      {'onRetry' in props && props.onRetry ? (
        <button className="secondary-button" type="button" onClick={props.onRetry}>
          Try again
        </button>
      ) : null}
    </section>
  );
}
