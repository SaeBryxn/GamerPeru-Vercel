# ADR-004 — Object Storage, Media Pipeline and Voucher Security

## Status
ACCEPTED

## Context
Gamer Perú handles two fundamentally distinct classes of media assets:
1. **Public Published Media**: High-resolution multi-brand product photography, custom 3D renders, exploded hardware schematics, and Product Story media requiring global edge CDN distribution, responsive image optimization (WebP/AVIF), and high cacheability.
2. **Private Operational Media**: Customer-submitted Yape/Plin payment verification screenshots and transfer vouchers containing sensitive personal financial data requiring strict access control, zero public CDN exposure, and authorized time-limited viewing.

## Decision Drivers
- **Privacy & Financial Compliance**: Private payment proofs must never be publicly accessible, indexable by search engines, or guessable via predictable URLs.
- **Storefront Performance**: Product imagery must load rapidly via modern formats (WebP/AVIF), avoid layout shifts, and support responsive `srcset` generation.
- **Cost Efficiency**: High bandwidth for image-heavy hardware catalogs without exorbitant egress fees.
- **Clear Architectural Separation**: Public application hosting (`gamerperu.com` on Vercel) and media delivery (`media.gamerperu.com` on Cloudflare) must remain clearly delineated without confusing reverse-proxy topologies.

## Options Considered
1. **Cloudflare R2 (S3-Compatible) + Cloudflare Image Transformations**: Zero egress fees, global edge distribution, integrated WebP/AVIF transformation, and native support for separate private buckets with signed URLs.
2. **AWS S3 + CloudFront**: Industry standard; highly reliable but incurs high egress data transfer fees and complex image optimization pipeline setup (Lambda@Edge).
3. **Supabase Storage**: Managed storage within the Supabase project. While suitable for basic file uploads, it is not optimized for high-volume, multi-brand high-resolution hardware photography or zero-egress large media catalogs, and would unnecessarily consume Supabase compute/bandwidth quotas.

## Decision
Adopt **Cloudflare R2 (S3-Compatible Object Storage)** with **Cloudflare Edge Media Delivery & Image Transformations** as the canonical object storage infrastructure. Supabase Storage is explicitly **excluded** from the catalog media pipeline.

1. **Public Media Bucket (`gamerperu-public-media`)**:
   - Stores catalog product photos, brand logos, 3D renders, and editorial Product Story media.
   - Connected to public media domain (`media.gamerperu.com`).
   - Cloudflare Image Transformations generate responsive WebP and AVIF variants based on client `Accept` headers and viewport parameters.
   - **Cloudflare Image Transformations Pricing & Free Limits**:
     * Source images remain stored in Cloudflare R2. (Cloudflare Images Storage at $5/100k images is a separate dimension and is not used).
     * Cloudflare Image Transformations Free includes up to 5,000 unique transformations/month.
     * Exceeding 5,000 transformations acts as a hard cap where cached existing transformations continue serving, but new transformations fail until upgraded to Paid Transformations ($0.50 per 1,000 additional unique transformations on Cloudflare paid zones).
     * *Mitigations during Free phase*: Enforce a strict set of standardized responsive variant presets (thumbnail, card, hero, story); avoid arbitrary client-requested dimensions; provide graceful source-image fallback if transformation fails; monitor monthly transformation volume.
   - Long-lived cache headers (`Cache-Control: public, max-age=31536000, immutable`) ensure high edge cache hit rates.
2. **Private Proofs Bucket (`gamerperu-private-proofs`)**:
   - Stores customer Yape/Plin payment transfer vouchers and screenshots.
   - **Access Model**: Configured with no anonymous public read access, no public custom media domain, no directory/index listing, and no unrestricted CDN delivery.
   - Authorized staff access requires Gamer Perú RBAC verification (`orders:verify`) before issuing a short-lived signed bearer URL (5-minute expiration) over HTTPS. Possession of an unexpired signed URL provides temporary object access.
   - *Bearer Credential Semantics*: Because an unexpired signed URL functions as a temporary bearer credential, URLs are transmitted strictly over HTTPS, never logged in standard application log streams, never included in analytics, served with `Cache-Control: private, no-store`, and logged as an authorization audit event upon generation.
   - File uploads enforce strict MIME type validation (JPEG, PNG, WebP only) and a strict 5MB size limit.
3. **R2 Object Lifecycle & Integrity**:
   - Cloudflare R2 exposes an S3-compatible API for the object operations Gamer Perú intends to use (PUT, GET, DELETE, HEAD, pre-signed URLs), but does NOT implement native S3 bucket versioning operations.
   - Integrity is safeguarded architecturally:
     * Public media uses immutable, content-hashed object keys (`/products/[brand]/[model]/[hash].webp`);
     * Database records maintain canonical object URIs;
     * Private proofs follow an application-level retention policy;
     * Database backups use timestamped object keys (`backup_YYYY-MM-DD_HHMMSS.sql.gz.enc`) with 30-day lifecycle rules in `gamerperu-db-backups-private`.

## Consequences
- **Positive**: Zero data egress fees, high-speed edge media delivery for customers in Peru, complete physical and logical isolation of sensitive financial vouchers, standard S3 API workflows.
- **Negative**: Requires monitoring Cloudflare Images free transformation caps and managing immutable key naming without relying on native bucket versioning.

## Security / SEO / Performance Impact
- **Security**: Complete physical and logical separation of sensitive customer payment proofs from public marketing assets.
- **SEO**: Product images delivered from a clean, custom media subdomain (`media.gamerperu.com`) with descriptive semantic URLs and fast LCP loading.
- **Performance**: Edge caching and AVIF/WebP compression drastically reduce bandwidth and mobile payload sizes.

## Migration / Reversal
Cloudflare R2 exposes an S3-compatible API for standard object operations, and application access is encapsulated behind a storage adapter. While standard object operations and pre-signed URL workflows improve portability, migrating to another S3-compatible provider (AWS S3, Google Cloud Storage, MinIO) will require revalidating provider-specific behavior, signing semantics, CDN/transformation integrations, and cache headers rather than assuming guaranteed zero-code parity.
