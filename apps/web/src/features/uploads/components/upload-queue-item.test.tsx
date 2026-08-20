import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UploadQueueItem } from './upload-queue-item.js';

const file = new File(['%PDF-test'], 'report.pdf', { type: 'application/pdf' });

describe('UploadQueueItem', () => {
  it('uses short user-facing labels instead of internal state names', () => {
    render(<UploadQueueItem item={{ clientId: '1', parentId: '2', file, state: 'preparing', bytesUploaded: 0, percent: 0, attempt: 0 }} onRetry={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Preparing')).toBeInTheDocument();
    expect(screen.queryByText('preparing')).not.toBeInTheDocument();
  });
});
