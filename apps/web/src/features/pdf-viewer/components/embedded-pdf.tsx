export function EmbeddedPdf({
  url,
  name,
}: Readonly<{ url: string; name: string }>): React.JSX.Element {
  return (
    <object
      data={url}
      type="application/pdf"
      className="pdf-viewer__embed"
      aria-label={`PDF document: ${name}`}
    >
      <p>
        This browser cannot display the PDF.{' '}
        <a href={url} rel="noreferrer">
          Open the document
        </a>
        .
      </p>
    </object>
  );
}
