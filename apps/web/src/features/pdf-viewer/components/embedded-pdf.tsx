export function EmbeddedPdf({
  url,
  name,
}: Readonly<{ url: string; name: string }>): React.JSX.Element {
  return (
    <iframe
      src={url}
      title={`PDF document: ${name}`}
      className="pdf-viewer__embed"
      aria-label={`PDF document: ${name}`}
    />
  );
}
