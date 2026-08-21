export type StoredObjectMetadata = Readonly<{
  sizeBytes: number;
  contentType: string | null;
}>;

export type SignedUploadCapability = Readonly<{
  token: string;
  bucketName: string;
  tusEndpoint: string;
  expiresAt: Date;
}>;

export abstract class StorageService {
  abstract createSignedUpload(storageKey: string): Promise<SignedUploadCapability>;
  abstract getMetadata(storageKey: string): Promise<StoredObjectMetadata | null>;
  abstract readPrefix(storageKey: string, byteCount: number): Promise<Uint8Array>;
  abstract createSignedReadUrl(
    storageKey: string,
    ttlSeconds: number,
    downloadName?: string,
  ): Promise<string>;
  abstract remove(storageKeys: readonly string[]): Promise<void>;
}
