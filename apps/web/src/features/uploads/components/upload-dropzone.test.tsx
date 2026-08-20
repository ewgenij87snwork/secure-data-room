import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UploadDropzone } from './upload-dropzone.js';

describe('UploadDropzone', () => {
  it('exposes a keyboard-accessible PDF chooser and disabled state', async () => {
    const onFilesSelected = vi.fn();
    render(<UploadDropzone disabled={false} onFilesSelected={onFilesSelected} />);
    const input = screen.getByLabelText('Choose PDF files');
    expect(input).toHaveAttribute('accept', 'application/pdf,.pdf');
    expect(input).toHaveAttribute('multiple');
    await userEvent.upload(input, new File(['%PDF-test'], 'document.pdf', { type: 'application/pdf' }));
    expect(onFilesSelected).toHaveBeenCalledWith([expect.any(File)]);
    render(<UploadDropzone disabled onFilesSelected={onFilesSelected} />);
    expect(screen.getAllByLabelText('Choose PDF files')[1]).toBeDisabled();
  });
});
