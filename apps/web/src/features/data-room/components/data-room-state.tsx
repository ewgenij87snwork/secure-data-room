import { LoaderCircle } from 'lucide-react';

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
      <div className="data-room-state data-room-state--loading" role="status">
        <LoaderCircle className="spin" size={19} aria-hidden="true" />
        {props.label}
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
