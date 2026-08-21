import { Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { StorageService, type StoredObjectMetadata } from './storage.service.js';

type StorageApi = ReturnType<SupabaseClient['storage']['from']>;

type StorageConfig = Readonly<{
  SUPABASE_URL: string;
  STORAGE_BUCKET: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}>;

type FetchLike = (input: string, init?: RequestInit) => Promise<object>;

function responseField(response: object, field: string): unknown {
  return (response as Readonly<Record<string, unknown>>)[field];
}

export function isPartialContentResponse(response: object): boolean {
  return responseField(response, 'ok') === true && responseField(response, 'status') === 206;
}

@Injectable()
export class SupabaseStorageService extends StorageService {
  private readonly bucket: StorageApi;
  private readonly tusEndpoint: string;

  constructor(
    private readonly client: Pick<SupabaseClient, 'storage'>,
    private readonly config: StorageConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    super();
    this.bucket = this.client.storage.from(config.STORAGE_BUCKET);
    this.tusEndpoint = tusEndpoint(config.SUPABASE_URL);
  }

  async createSignedUpload(storageKey: string) {
    const result = await this.bucket.createSignedUploadUrl(storageKey, { upsert: false });
    if (result.error || !result.data.token) throw new Error('Storage signing failed.');
    return {
      token: result.data.token,
      bucketName: this.config.STORAGE_BUCKET,
      tusEndpoint: this.tusEndpoint,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    };
  }

  async getMetadata(storageKey: string): Promise<StoredObjectMetadata | null> {
    const slash = storageKey.lastIndexOf('/');
    const folder = slash < 0 ? '' : storageKey.slice(0, slash);
    const name = storageKey.slice(slash + 1);
    const result = await this.bucket.list(folder, { search: name, limit: 2, offset: 0 });
    if (result.error) throw new Error('Storage metadata failed.');
    const object = result.data.find((entry) => entry.name === name);
    if (!object) return null;
    const metadata = object.metadata as { size?: unknown; mimetype?: unknown } | null | undefined;
    const size = typeof metadata?.size === 'number' ? metadata.size : Number(metadata?.size);
    return {
      sizeBytes: Number.isFinite(size) ? size : 0,
      contentType: typeof metadata?.mimetype === 'string' ? metadata.mimetype : null,
    };
  }

  async readPrefix(storageKey: string, byteCount: number): Promise<Uint8Array> {
    if (byteCount <= 0) return new Uint8Array();
    const url = `${this.config.SUPABASE_URL.replace(/\/$/u, '')}/storage/v1/object/${encodeURIComponent(this.config.STORAGE_BUCKET)}/${storageKey.split('/').map(encodeURIComponent).join('/')}`;
    const response = await this.fetchImpl(url, {
      headers: {
        Range: `bytes=0-${byteCount - 1}`,
        ...(this.config.SUPABASE_SERVICE_ROLE_KEY
          ? {
              apikey: this.config.SUPABASE_SERVICE_ROLE_KEY,
              ...(this.config.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_secret_')
                ? {}
                : { Authorization: `Bearer ${this.config.SUPABASE_SERVICE_ROLE_KEY}` }),
            }
          : {}),
      },
    });
    const readBody = responseField(response, 'arrayBuffer');
    if (!isPartialContentResponse(response) || typeof readBody !== 'function') {
      throw new Error('Storage read failed.');
    }
    const body: unknown = await (readBody as () => Promise<unknown>).call(response);
    if (!(body instanceof ArrayBuffer)) throw new Error('Storage read failed.');
    return new Uint8Array(body).slice(0, byteCount);
  }

  async createSignedReadUrl(
    storageKey: string,
    ttlSeconds: number,
    downloadName?: string,
  ): Promise<string> {
    const result = downloadName
      ? await this.bucket.createSignedUrl(storageKey, ttlSeconds, { download: downloadName })
      : await this.bucket.createSignedUrl(storageKey, ttlSeconds);
    if (result.error || !result.data.signedUrl) throw new Error('Storage signing failed.');
    return result.data.signedUrl;
  }

  async remove(storageKeys: readonly string[]): Promise<void> {
    for (let offset = 0; offset < storageKeys.length; offset += 100) {
      const result = await this.bucket.remove([...storageKeys.slice(offset, offset + 100)]);
      if (result.error) throw new Error('Storage removal failed.');
    }
  }
}

function tusEndpoint(origin: string): string {
  const normalized = origin.replace(/\/$/u, '');
  try {
    const url = new URL(normalized);
    const hosted = url.protocol === 'https:' && url.hostname.endsWith('.supabase.co');
    if (hosted) {
      const projectRef = url.hostname.slice(0, -'.supabase.co'.length);
      return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable/sign`;
    }
  } catch {
    // Configuration validation rejects malformed URLs before this service is constructed.
  }
  return `${normalized}/storage/v1/upload/resumable/sign`;
}
