import { Module } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../config/env.js';
import { StorageService } from './storage.service.js';
import { SupabaseStorageService } from './supabase-storage.service.js';

class LazyStorageService extends StorageService {
  private delegate: SupabaseStorageService | undefined;

  constructor(private readonly createDelegate: () => SupabaseStorageService) {
    super();
  }

  private get service(): SupabaseStorageService {
    this.delegate ??= this.createDelegate();
    return this.delegate;
  }

  createSignedUpload(storageKey: string) {
    return this.service.createSignedUpload(storageKey);
  }
  getMetadata(storageKey: string) {
    return this.service.getMetadata(storageKey);
  }
  readPrefix(storageKey: string, byteCount: number) {
    return this.service.readPrefix(storageKey, byteCount);
  }
  createSignedReadUrl(storageKey: string, ttlSeconds: number, downloadName?: string) {
    return this.service.createSignedReadUrl(storageKey, ttlSeconds, downloadName);
  }
  remove(storageKeys: readonly string[]) {
    return this.service.remove(storageKeys);
  }
}

@Module({
  providers: [
    {
      provide: StorageService,
      useFactory: () =>
        new LazyStorageService(() => {
          const env = getEnv();
          return new SupabaseStorageService(
            createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
              auth: { autoRefreshToken: false, persistSession: false },
            }),
            env,
          );
        }),
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
