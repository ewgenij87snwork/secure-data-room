export function startFileDownload(url: string, name: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noreferrer';
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
}
