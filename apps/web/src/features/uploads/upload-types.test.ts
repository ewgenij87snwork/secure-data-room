import { describe, expect, it } from 'vitest';
import { validatePdf, validatePdfSelection } from './upload-types.js';

const pdf = (name = 'valid.pdf', type = 'application/pdf', body = '%PDF-1.7'): File => new File([body], name, { type });

describe('PDF intake validation', () => {
  it('rejects empty, oversized, MIME, extension, and signature violations', async () => {
    expect(await validatePdf(new File([], 'empty.pdf', { type: 'application/pdf' }))).toMatch(/empty/);
    expect(await validatePdf(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.pdf', { type: 'application/pdf' }))).toMatch(/10 MB/);
    expect(await validatePdf(pdf('mime.pdf', 'text/plain'))).toMatch(/Only PDF/);
    expect(await validatePdf(pdf('wrong.txt'))).toMatch(/extension/);
    expect(await validatePdf(pdf('signature.pdf', 'application/pdf', 'hello'))).toMatch(/signature/);
  });

  it('keeps valid files and reports mixed batches without exceeding ten accepted inputs', async () => {
    const selection = await validatePdfSelection([pdf(), pdf('bad.pdf', 'application/pdf', 'nope'), ...Array.from({ length: 8 }, (_, i) => pdf(`${i}.pdf`))]);
    expect(selection.valid).toHaveLength(9);
    expect(selection.errors).toEqual([expect.stringContaining('bad.pdf')]);
  });
});
