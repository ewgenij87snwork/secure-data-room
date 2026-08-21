import { Check, Copy, Link2 } from 'lucide-react';
import { useState } from 'react';
export function PublicLinkPanel({
  url,
  onCreate,
  isCreating,
  disabled,
}: {
  url?: string;
  onCreate: () => void;
  isCreating?: boolean;
  disabled?: boolean;
}): React.JSX.Element {
  const [copyStatus, setCopyStatus] = useState<{ url: string; success: boolean } | null>(null);
  const copied = copyStatus?.url === url && copyStatus?.success === true;
  const copyError = copyStatus?.url === url && copyStatus?.success === false;

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus({ url, success: true });
    } catch {
      setCopyStatus({ url, success: false });
    }
  };
  return (
    <section className="share-section" aria-labelledby="public-link-title">
      <div className="share-section__title">
        <Link2 size={17} aria-hidden="true" />
        <h2 id="public-link-title">One-time public link</h2>
      </div>
      <p>Anyone with this link can view this shared scope. It is shown once.</p>
      {url ? (
        <>
          <div className="share-link-row">
            <label className="sr-only" htmlFor="public-share-url">
              Public link
            </label>
            <input
              id="public-share-url"
              className="share-link-row__input"
              readOnly
              value={url}
              aria-describedby={copyError ? 'public-share-copy-error' : undefined}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button className="secondary-button" type="button" onClick={() => void copy()}>
              {copied ? (
                <>
                  <Check size={16} aria-hidden="true" /> Copied
                </>
              ) : (
                <>
                  <Copy size={16} aria-hidden="true" /> Copy link
                </>
              )}
            </button>
          </div>
          {copyError ? (
            <p id="public-share-copy-error" className="form-error" role="alert">
              Copy was blocked. Select the link and copy it manually.
            </p>
          ) : (
            <p className="share-link-hint" aria-live="polite">
              {copied
                ? 'Link copied to clipboard.'
                : 'Select the field if you need to copy it manually.'}
            </p>
          )}
        </>
      ) : (
        <button
          className="primary-button"
          type="button"
          onClick={onCreate}
          disabled={disabled === true || isCreating === true}
        >
          {isCreating ? 'Creating…' : 'Create public link'}
        </button>
      )}
    </section>
  );
}
