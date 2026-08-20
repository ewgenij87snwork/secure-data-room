import { Check, Copy, Link2 } from 'lucide-react';
import { useState } from 'react';
export function PublicLinkPanel({
  url,
  onCreate,
  isCreating,
}: {
  url?: string;
  onCreate: () => void;
  isCreating?: boolean;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
  };
  return (
    <section className="share-section" aria-labelledby="public-link-title">
      <div className="share-section__title">
        <Link2 size={17} aria-hidden="true" />
        <h2 id="public-link-title">One-time public link</h2>
      </div>
      <p>Anyone with this link can view this shared scope. It is shown once.</p>
      {url ? (
        <div className="share-link-row">
          <code>{url}</code>
          <button className="secondary-button" type="button" onClick={() => void copy()}>
            {copied ? (
              <>
                <Check size={16} aria-hidden="true" /> Copied
              </>
            ) : (
              <>
                <Copy size={16} aria-hidden="true" /> Copy
              </>
            )}
          </button>
        </div>
      ) : (
        <button className="primary-button" type="button" onClick={onCreate} disabled={isCreating}>
          {isCreating ? 'Creating…' : 'Create public link'}
        </button>
      )}
    </section>
  );
}
