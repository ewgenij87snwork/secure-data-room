import { MailPlus } from 'lucide-react';
import { useState } from 'react';
export function PermissionedShareForm({
  onSubmit,
  isSubmitting,
  error,
}: {
  onSubmit: (email: string) => void;
  isSubmitting?: boolean;
  error?: string | null;
}): React.JSX.Element {
  const [email, setEmail] = useState('');
  return (
    <form
      className="share-section"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(email);
      }}
      aria-labelledby="permissioned-title"
    >
      <div className="share-section__title">
        <MailPlus size={17} aria-hidden="true" />
        <h2 id="permissioned-title">Share with a person</h2>
      </div>
      <p>Grant view-only access to a verified email address.</p>
      <label htmlFor="share-email">Email address</label>
      <div className="share-form-row">
        <input
          id="share-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@company.com"
        />
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Sharing…' : 'Share'}
        </button>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
