import { describe, expect, it } from 'vitest';
import {
  MAX_PDF_BYTES,
  apiErrorCodeSchema,
  bootstrapResponseSchema,
  byteCountSchema,
  nodeNameSchema,
  prepareUploadRequestSchema,
  listNodeChildrenResponseSchema,
  nodeBreadcrumbsResponseSchema,
  preparedUploadSchema,
  createPermissionedShareRequestSchema,
  createPermissionedShareResponseSchema,
  createPublicShareRequestSchema,
  createPublicShareResponseSchema,
  listSharesResponseSchema,
  revokeShareResponseSchema,
  sharedWithMeResponseSchema,
  publicShareTokenHeaderSchema,
  publicShareNodeResponseSchema,
} from './index.js';

const validBootstrapResponse = {
  user: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'owner@example.com',
    displayName: null,
  },
  room: {
    id: '650e8400-e29b-41d4-a716-446655440000',
    name: 'Room',
    rootNodeId: '750e8400-e29b-41d4-a716-446655440000',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  runtime: {
    registrationOpen: false,
    uploadsEnabled: false,
    publicLinksEnabled: true,
    maintenanceMode: false,
    updatedAt: '2026-01-01T00:00:00.000+02:00',
  },
};

describe('shared contracts', () => {
  it('accepts the exact runtime snapshot', () => {
    expect(bootstrapResponseSchema.parse(validBootstrapResponse)).toEqual(validBootstrapResponse);
  });

  it('rejects an invalid runtime updatedAt value', () => {
    const result = bootstrapResponseSchema.safeParse({
      ...validBootstrapResponse,
      runtime: {
        ...validBootstrapResponse.runtime,
        updatedAt: 'not-a-date',
      },
    });
    expect(result.success).toBe(false);
  });

  it('normalizes user-visible names once at the boundary', () => {
    expect(nodeNameSchema.parse('  Ｌｅｇａｌ  ')).toBe('Legal');
  });

  it('rejects path-like and control-character names', () => {
    expect(() => nodeNameSchema.parse('../Contracts')).toThrow();
    expect(() => nodeNameSchema.parse('Bad\u0000Name')).toThrow();
  });

  it('serializes database bigint byte counts as decimal strings', () => {
    expect(byteCountSchema.parse('10485760')).toBe('10485760');
    expect(() => byteCountSchema.parse('10.5')).toThrow();
  });

  it('enforces PDF batch boundaries', () => {
    const request = {
      parentId: '550e8400-e29b-41d4-a716-446655440000',
      files: [
        {
          clientId: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
          name: 'Agreement.pdf',
          sizeBytes: MAX_PDF_BYTES,
          mimeType: 'application/pdf',
        },
      ],
    } as const;

    expect(prepareUploadRequestSchema.parse(request)).toEqual(request);
    expect(() =>
      prepareUploadRequestSchema.parse({
        ...request,
        files: [{ ...request.files[0], sizeBytes: MAX_PDF_BYTES + 1 }],
      }),
    ).toThrow();
  });

  it('requires and preserves the prepared upload bucket name', () => {
    const preparedUpload = {
      clientId: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
      sessionId: '750e8400-e29b-41d4-a716-446655440000',
      bucketName: 'secure-data-room',
      storageKey: 'uploads/6ba7b810-9dad-41d1-80b4-00c04fd430c8.pdf',
      tusEndpoint: 'https://storage.example.com/upload/resumable',
      uploadToken: '1234567890abcdef',
      expiresAt: '2026-01-01T00:00:00.000+02:00',
    } as const;

    expect(preparedUploadSchema.parse(preparedUpload)).toEqual(preparedUpload);
    expect(() => {
      const withoutBucketName = {
        clientId: preparedUpload.clientId,
        sessionId: preparedUpload.sessionId,
        storageKey: preparedUpload.storageKey,
        tusEndpoint: preparedUpload.tusEndpoint,
        uploadToken: preparedUpload.uploadToken,
        expiresAt: preparedUpload.expiresAt,
      };
      preparedUploadSchema.parse(withoutBucketName);
    }).toThrow();
  });

  it('keeps error codes stable and machine-readable', () => {
    expect(apiErrorCodeSchema.parse('NAME_CONFLICT')).toBe('NAME_CONFLICT');
    expect(() => apiErrorCodeSchema.parse('Something went wrong')).toThrow();
  });

  it('parses the narrow children response', () => {
    expect(
      listNodeChildrenResponseSchema.parse({
        items: [],
        pageInfo: { nextCursor: null, hasNextPage: false },
      }),
    ).toEqual({ items: [], pageInfo: { nextCursor: null, hasNextPage: false } });
  });

  it('parses the narrow breadcrumb response without pagination fields', () => {
    expect(
      nodeBreadcrumbsResponseSchema.parse({
        items: [{ id: '550e8400-e29b-41d4-a716-446655440000', name: 'Legal' }],
      }),
    ).toEqual({
      items: [{ id: '550e8400-e29b-41d4-a716-446655440000', name: 'Legal' }],
    });
  });

  it('freezes sharing request and response shapes without placing tokens in payloads', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const canonicalToken = `${'a'.repeat(42)}g`;
    const share = {
      id,
      targetNodeId: id,
      targetName: 'Contracts',
      principalType: 'USER' as const,
      role: 'VIEWER' as const,
      recipientEmail: 'reviewer@example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      revokedAt: null,
    };

    expect(createPermissionedShareRequestSchema.parse({ email: ' Reviewer@Example.com ' })).toEqual(
      {
        email: 'reviewer@example.com',
        role: 'VIEWER',
      },
    );
    expect(createPermissionedShareResponseSchema.parse(share)).toEqual(share);
    expect(createPublicShareRequestSchema.parse({})).toEqual({});
    expect(() => createPublicShareRequestSchema.parse({ token: 'a'.repeat(43) })).toThrow();
    expect(listSharesResponseSchema.parse({ items: [share] })).toEqual({ items: [share] });
    expect(revokeShareResponseSchema.parse({ shareId: id, revoked: true })).toEqual({
      shareId: id,
      revoked: true,
    });
    expect(
      createPublicShareResponseSchema.parse({
        shareId: id,
        url: `https://room.example/share#token=${canonicalToken}`,
        targetName: 'Contracts',
      }),
    ).toHaveProperty('url');
    expect(() =>
      createPublicShareResponseSchema.parse({
        shareId: id,
        url: 'https://room.example/share?token=raw-token',
        targetName: 'Contracts',
      }),
    ).toThrow();
    expect(canonicalToken).toHaveLength(43);
    expect(() => publicShareTokenHeaderSchema.parse(canonicalToken)).not.toThrow();
    expect(() => publicShareTokenHeaderSchema.parse('a'.repeat(42))).toThrow();
    expect(() => publicShareTokenHeaderSchema.parse('a'.repeat(44))).toThrow();
    expect(() => publicShareTokenHeaderSchema.parse('a'.repeat(43))).toThrow();
    expect(() => publicShareTokenHeaderSchema.parse(`${'a'.repeat(42)}+`)).toThrow();
    expect(() =>
      createPermissionedShareRequestSchema.parse({ email: 'a@b.test', token: 'raw-token' }),
    ).toThrow();
  });

  it('freezes shared-with-me keyset pages and read-only public node access', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const item = {
      share: {
        id,
        targetNodeId: id,
        targetName: 'Contracts',
        principalType: 'USER' as const,
        role: 'VIEWER' as const,
        recipientEmail: 'reviewer@example.com',
        createdAt: '2026-01-01T00:00:00.000Z',
        revokedAt: null,
      },
      node: {
        id,
        dataRoomId: id,
        parentId: null,
        kind: 'FOLDER' as const,
        name: 'Contracts',
        sizeBytes: null,
        mimeType: null,
        revision: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        isShared: true,
        accessRole: 'VIEWER' as const,
      },
      owner: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        email: 'owner@example.com',
        displayName: 'Owner',
      },
    };
    expect(
      sharedWithMeResponseSchema.parse({
        items: [item],
        pageInfo: { nextCursor: null, hasNextPage: false },
      }),
    ).toEqual({
      items: [item],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    expect(publicShareNodeResponseSchema.parse(item.node)).toEqual(item.node);
    expect(() =>
      publicShareNodeResponseSchema.parse({ ...item.node, accessRole: 'EDITOR' }),
    ).toThrow();
  });
});
