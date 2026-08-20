import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PdfViewerToolbar({
  name,
  onRefresh,
}: Readonly<{ name: string; onRefresh: () => void }>): React.JSX.Element {
  return (
    <header className="pdf-viewer__toolbar">
      <Link className="secondary-button" to="/workspace">
        <ArrowLeft size={17} aria-hidden="true" /> Back to files
      </Link>
      <h1 title={name}>{name}</h1>
      <button
        className="icon-button"
        type="button"
        aria-label="Refresh document access"
        onClick={onRefresh}
      >
        <RefreshCw size={18} aria-hidden="true" />
      </button>
    </header>
  );
}
