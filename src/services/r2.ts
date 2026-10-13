import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

export interface R2ObjectMetadata {
  size: number;
  lastModified: Date;
  etag: string;
}

export interface R2Config {
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
  publicDomain?: string; // Optional custom domain or worker URL
}

export class R2Service {
  private client: S3Client | null = null;
  private bucketName: string;
  private publicDomain?: string;
  private isConfigured: boolean = false;

  // In-memory fallback cache for development/demo when R2 keys aren't provided
  private static localMemoryCache: Map<string, { buffer: Buffer; lastModified: Date; eTag: string }> =
    new Map();

  public static clearMemoryCache(): void {
    R2Service.localMemoryCache.clear();
  }

  public static deleteMemoryCache(key: string): boolean {
    return R2Service.localMemoryCache.delete(key);
  }

  /**
   * Read the metadata (lastModified, eTag) for an in-memory cache entry
   * without disturbing it. Returned so callers can decide whether the
   * cached blob is stale relative to credentials-first-seen or another
   * external signal without re-uploading or evicting the entry.
   */
  public static getCacheMeta(
    key: string
  ): { lastModified: Date; eTag: string } | null {
    const entry = R2Service.localMemoryCache.get(key);
    if (!entry) return null;
    return { lastModified: entry.lastModified, eTag: entry.eTag };
  }

  constructor(config?: R2Config) {
    const accountId = config?.accountId || process.env.R2_ACCOUNT_ID;
    const accessKeyId = config?.accessKeyId || process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = config?.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY;
    this.bucketName = config?.bucketName || process.env.R2_BUCKET_NAME || 'wow-forever-ah-cache';
    this.publicDomain = config?.publicDomain || process.env.R2_PUBLIC_DOMAIN;

    if (accountId && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      this.isConfigured = true;
    } else {
      this.isConfigured = false;
    }
  }

  /**
   * Status indicator whether real Cloudflare R2 is configured or in-memory fallback is active.
   */
  public hasCloudflareR2(): boolean {
    return this.isConfigured && this.client !== null;
  }

  /**
   * Generates standard WoW Forever AH storage path for an item:
   *   data/cached/{product}/{region}/{connectedRealmId}/{itemId & 0xFF}/{itemId}.bin
   */
  public static generateItemKey(
    product: 'retail' | 'forever',
    region: 'eu' | 'us',
    connectedRealmId: number,
    itemId: number
  ): string {
    const shard = itemId & 0xff;
    return `data/cached/${product}/${region}/${connectedRealmId}/${shard}/${itemId}.bin`;
  }

  /**
   * Generates standard WoW Forever AH storage path for realm state:
   *   data/cached/{product}/{region}/{connectedRealmId}/state.bin
   */
  public static generateStateKey(
    product: 'retail' | 'forever',
    region: 'eu' | 'us',
    connectedRealmId: number
  ): string {
    return `data/cached/${product}/${region}/${connectedRealmId}/state.bin`;
  }

  /**
   * Upload binary file to Cloudflare R2 or local cache with optimal HTTP headers.
   */
  public async uploadBin(
    key: string,
    buffer: Buffer,
    cacheControl: string = 'public, max-age=900, stale-while-revalidate=3600'
  ): Promise<{ success: boolean; key: string; size: number; source: 'r2' | 'local_cache' }> {
    const eTag = `"${Date.now()}-${buffer.length}"`;

    // Always keep in local memory cache for ultra-fast local readbacks
    R2Service.localMemoryCache.set(key, {
      buffer,
      lastModified: new Date(),
      eTag,
    });

    if (!this.hasCloudflareR2() || !this.client) {
      return {
        success: true,
        key,
        size: buffer.length,
        source: 'local_cache',
      };
    }

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: 'application/octet-stream',
        CacheControl: cacheControl,
      });

      await this.client.send(command);

      return {
        success: true,
        key,
        size: buffer.length,
        source: 'r2',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[R2Service] R2 upload error for ${key} (${message}). Retained in memory cache.`);
      return {
        success: true,
        key,
        size: buffer.length,
        source: 'local_cache',
      };
    }
  }

  /**
   * Retrieve binary buffer from Cloudflare R2 or local fallback cache.
   */
  public async getBin(key: string): Promise<Buffer | null> {
    // Check memory cache first
    const cached = R2Service.localMemoryCache.get(key);
    if (cached) {
      return cached.buffer;
    }

    if (!this.hasCloudflareR2() || !this.client) {
      return null;
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.client.send(command);
      if (!response.Body) return null;

      const byteArray = await response.Body.transformToByteArray();
      const buffer = Buffer.from(byteArray);

      // Populate local cache
      R2Service.localMemoryCache.set(key, {
        buffer,
        lastModified: response.LastModified || new Date(),
        eTag: response.ETag || '',
      });

      return buffer;
    } catch (err: unknown) {
      // Falling back to "not cached" is the correct behaviour for a cache miss,
      // but a genuine S3/R2 failure (bad credentials, network, wrong bucket)
      // used to be swallowed silently, which made production misconfiguration
      // almost impossible to diagnose. The unconfigured case already returns
      // early via `hasCloudflareR2()`, so reaching here is worth a log line.
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[R2] getBin("${key}") failed, treating as cache miss: ${reason}`);
      return null;
    }
  }

  /**
   * Check if file exists in R2 or local cache.
   */
  public async hasBin(key: string): Promise<boolean> {
    if (R2Service.localMemoryCache.has(key)) {
      return true;
    }

    if (!this.hasCloudflareR2() || !this.client) {
      return false;
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cheap metadata fetch (HeadObject, no body download). Used to skip
   * re-uploading items already in R2 with matching size — saves Class A
   * operations on re-runs and doesn't waste bandwidth.
   */
  public async getBinMetadata(key: string): Promise<R2ObjectMetadata | null> {
    if (R2Service.localMemoryCache.has(key)) {
      const m = R2Service.localMemoryCache.get(key)!;
      return { size: m.buffer.length, lastModified: m.lastModified, etag: m.eTag };
    }

    if (!this.hasCloudflareR2() || !this.client) {
      return null;
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      const r = await this.client.send(command);
      return {
        size: r.ContentLength || 0,
        lastModified: r.LastModified || new Date(),
        etag: r.ETag || '',
      };
    } catch {
      return null;
    }
  }

  /**
   * Paginated list of R2 keys under `prefix`. With `delimiter` set (e.g. "/")
   * R2 also returns CommonPrefixes — directory-style listings without
   * enumerating every key, which is what realm/item enumeration needs.
   */
  public async listKeys(
    prefix: string,
    delimiter?: string
  ): Promise<{ keys: string[]; prefixes: string[] }> {
    const keys: string[] = [];
    const prefixes: string[] = [];

    if (!this.hasCloudflareR2() || !this.client) {
      // Empty memory cache means nothing to enumerate; R2 not configured.
      // Caller is expected to handle the empty result gracefully.
      for (const k of R2Service.localMemoryCache.keys()) {
        if (k.startsWith(prefix)) keys.push(k);
      }
      return { keys, prefixes };
    }

    let token: string | undefined;
    do {
      const cmd = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        Delimiter: delimiter,
        ContinuationToken: token,
        MaxKeys: 1000,
      });
      const r = await this.client.send(cmd);
      if (r.Contents) {
        for (const obj of r.Contents) {
          if (obj.Key) keys.push(obj.Key);
        }
      }
      if (r.CommonPrefixes) {
        for (const p of r.CommonPrefixes) {
          if (p.Prefix) prefixes.push(p.Prefix);
        }
      }
      token = r.NextContinuationToken;
    } while (token);

    return { keys, prefixes };
  }
}
