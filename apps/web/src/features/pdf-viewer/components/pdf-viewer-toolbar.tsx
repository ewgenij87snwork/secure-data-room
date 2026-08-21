import { ArrowLeft, Download, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PdfViewerToolbar({
  name,
  onRefresh,
  downloadUrl,
}: Readonly<{
  name: string;
  onRefresh: () => void;
  downloadUrl?: string | undefined;
}>): React.JSX.Element {
  return (
    <header className="pdf-viewer__toolbar">
      <Link className="secondary-button" to="/workspace">
        <ArrowLeft size={17} aria-hidden="true" /> Back to files
      </Link>
      <h1 title={name}>{name}</h1>
      <div className="pdf-viewer__actions">
        {downloadUrl ? (
          <a className="primary-button" href={downloadUrl} download={name} rel="noreferrer">
            <Download size={17} aria-hidden="true" /> Download PDF
          </a>
        ) : null}
        <button
          className="icon-button"
          type="button"
          aria-label="Refresh document access"
          onClick={onRefresh}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
