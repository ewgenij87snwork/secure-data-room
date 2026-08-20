import { Link } from 'react-router-dom';
import { useSharedWithMe } from './queries.js';
import { SharedItemCard } from './components/shared-item-card.js';
export function SharedWithMeRoute(): React.JSX.Element {
  const query = useSharedWithMe();
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <main className="sharing-page">
      <header className="sharing-page__header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Shared with me</h1>
          <p>View-only materials other people have shared with your account.</p>
        </div>
        <Link className="secondary-button" to="/workspace">
          Back to workspace
        </Link>
      </header>
      {query.isLoading ? (
        <p role="status">Loading shared items…</p>
      ) : query.isError ? (
        <p role="alert">Shared items could not be loaded. Try again in a moment.</p>
      ) : items.length === 0 ? (
        <section className="sharing-empty">
          <h2>Nothing shared with you yet.</h2>
          <p>When a room owner grants access, it will appear here.</p>
        </section>
      ) : (
        <div className="shared-item-grid">
          {items.map((item) => (
            <SharedItemCard key={item.share.id} item={item} />
          ))}
        </div>
      )}
      {query.hasNextPage ? (
        <button
          className="secondary-button"
          type="button"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </main>
  );
}
