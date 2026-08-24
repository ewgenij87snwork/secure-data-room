import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiException } from '../common/api-exception.js';
import {
  MAX_ACTIVE_FILES,
  MAX_ACTIVE_UPLOAD_SESSIONS,
  MAX_FINALIZED_BYTES,
  MAX_GLOBAL_STORAGE_BYTES,
  MAX_PROVIDER_OBJECT_BYTES,
  UploadQuotaService,
} from './upload-quota.service.js';

interface SqlTemplate {
  strings: readonly string[];
}

function transactionRow(values: {
  activeSessions: number;
  finalizedBytes: number;
  activeFiles: number;
}) {
  return { $queryRaw: vi.fn().mockResolvedValue([{ ...values, reservedBytes: 0 }]) } as never;
}

describe('UploadQuotaService', () => {
  it.each([
    [{ activeSessions: MAX_ACTIVE_UPLOAD_SESSIONS - 1, finalizedBytes: 0, activeFiles: 0 }, 2, 0],
    [{ activeSessions: 0, finalizedBytes: MAX_FINALIZED_BYTES - 1, activeFiles: 0 }, 1, 2],
    [{ activeSessions: 0, finalizedBytes: 0, activeFiles: MAX_ACTIVE_FILES - 1 }, 2, 0],
  ])(
    'rejects a batch that exceeds one quota dimension',
    async (row, batchCount, requestedBytes) => {
      await expect(
        new UploadQuotaService().assertBatchFits(
          transactionRow(row),
          '11111111-1111-4111-8111-111111111111',
          batchCount,
          requestedBytes,
        ),
      ).rejects.toMatchObject({
        response: { error: { code: 'QUOTA_EXCEEDED' } },
        status: HttpStatus.CONFLICT,
      });
    },
  );

  it('accepts a batch within all quota dimensions', async () => {
    await expect(
      new UploadQuotaService().assertBatchFits(
        transactionRow({ activeSessions: 1, finalizedBytes: 12, activeFiles: 1 }),
        '11111111-1111-4111-8111-111111111111',
        2,
        24,
      ),
    ).resolves.toBeUndefined();
  });

  it('restores the intended 50 MiB per-owner finalized-byte limit', () => {
    expect(MAX_FINALIZED_BYTES).toBe(50 * 1024 * 1024);
  });

  it('rejects a batch that would exceed the global physical storage cap', async () => {
    const query = vi.fn<(sql: SqlTemplate) => Promise<unknown>>().mockResolvedValue([
      {
        activeSessions: 0,
        reservedBytes: 0,
        finalizedBytes: 0,
        activeFiles: 0,
        globalStorageBytes: MAX_GLOBAL_STORAGE_BYTES - 1,
      },
    ]);

    await expect(
      new UploadQuotaService().assertBatchFits(
        { $queryRaw: query } as never,
        '11111111-1111-4111-8111-111111111111',
        1,
        2,
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'QUOTA_EXCEEDED' } } });
  });

  it('serializes global accounting through the runtime-control singleton row', async () => {
    const query = vi.fn<(sql: SqlTemplate) => Promise<unknown>>().mockResolvedValue([
      {
        activeSessions: 0,
        reservedBytes: 0,
        finalizedBytes: 0,
        activeFiles: 0,
        globalStorageBytes: 0,
      },
    ]);

    await new UploadQuotaService().assertBatchFits(
      { $queryRaw: query } as never,
      '11111111-1111-4111-8111-111111111111',
      1,
      2,
    );
    expect(query.mock.calls[0]?.[0]?.strings.join('')).toContain(
      'FROM "RuntimeControl" WHERE id = 1 FOR UPDATE',
    );
  });

  it('accounts for unfinalized sessions and tombstoned file nodes globally', async () => {
    const query = vi.fn<(sql: SqlTemplate) => Promise<unknown>>().mockResolvedValue([
      {
        activeSessions: 0,
        reservedBytes: 0,
        finalizedBytes: 0,
        activeFiles: 0,
        globalStorageBytes: 0,
      },
    ]);

    await new UploadQuotaService().assertBatchFits(
      { $queryRaw: query } as never,
      '11111111-1111-4111-8111-111111111111',
      1,
      2,
    );
    const sql = query.mock.calls[0]?.[0]?.strings.join('') ?? '';
    expect(sql).toContain('FROM "UploadSession"');
    expect(sql).toContain('FROM "Node" n');
    expect(sql).toContain('FROM "Node" WHERE kind = \'FILE\'');
    expect(sql).toContain('GREATEST("expectedSizeBytes"');
    expect(sql).toContain('"StorageCleanupJob"');
    expect(sql).toContain('parent.depth < ');
    expect(sql).toContain('NOT child."id" = ANY(parent.path)');
    expect(sql).toContain('child."dataRoomId" = parent."dataRoomId"');
  });

  it('reserves at least one provider-sized object for tiny unfinalized uploads', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        activeSessions: 0,
        reservedBytes: 0,
        finalizedBytes: 0,
        activeFiles: 0,
        globalStorageBytes: MAX_GLOBAL_STORAGE_BYTES - MAX_PROVIDER_OBJECT_BYTES + 1,
      },
    ]);

    await expect(
      new UploadQuotaService().assertBatchFits(
        { $queryRaw: query } as never,
        '11111111-1111-4111-8111-111111111111',
        1,
        1,
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'QUOTA_EXCEEDED' } } });
  });

  it('uses a typed domain exception rather than an error message', async () => {
    const result = new UploadQuotaService().assertBatchFits(
      transactionRow({
        activeSessions: MAX_ACTIVE_UPLOAD_SESSIONS,
        finalizedBytes: 0,
        activeFiles: 0,
      }),
      '11111111-1111-4111-8111-111111111111',
      1,
      0,
    );
    await expect(result).rejects.toBeInstanceOf(ApiException);
  });

  it('counts active reservations in the SQL quota query', async () => {
    const query = vi
      .fn<(sql: { strings: readonly string[] }) => Promise<unknown>>()
      .mockResolvedValue([
        { activeSessions: 1, reservedBytes: 50, finalizedBytes: 40, activeFiles: 1 },
      ]);
    await expect(
      new UploadQuotaService().assertBatchFits(
        { $queryRaw: query } as never,
        '11111111-1111-4111-8111-111111111111',
        1,
        10,
      ),
    ).resolves.toBeUndefined();
    expect(query.mock.calls[0]?.[0]?.strings.join('')).toContain('sum("expectedSizeBytes")');
  });

  it('rejects when the quota query returns no row instead of failing open', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) } as never;

    await expect(
      new UploadQuotaService().assertBatchFits(tx, '11111111-1111-4111-8111-111111111111', 1, 1),
    ).rejects.toMatchObject({
      response: { error: { code: 'INTERNAL_ERROR' } },
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
  });
});
