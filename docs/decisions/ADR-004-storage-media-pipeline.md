# ADR-004 — Object Storage and Media Pipeline

## Status
ACCEPTED

## Context
Gamer Perú handles two fundamentally distinct classes of media assets:
1. **Public Published Media**: High-resolution multi-brand product photography, custom 3D renders, exploded hardware schematics, and Product Story videos requiring global edge CDN distribution, image optimization (WebP/AVIF), and high cacheability.
2. **Private Operational Media**: Customer-submitted Yape/Plin payment verification screenshots and transfer vouchers containing sensitive personal financial data requiring strict access control, zero public CDN exposure, and authorized time-limited viewing.

## Decision Drivers
- **Privacy & Financial Compliance**: Private payment proofs must never be publicly accessible, indexable by search engines, or guessable via predictable URLs.
- **Storefront Performance**: Product imagery must load rapidly via modern formats (WebP/AVIF), avoid layout shifts, and support responsive `srcset` generation.
- **Cost Efficiency**: High bandwidth for image-heavy hardware catalogs without exorbitant egress fees.

## Options Considered
1. **Cloudflare R2 (S3-Compatible) + Cloudflare Images / CDN**: Zero egress fees, global edge distribution, integrated WebP/AVIF transformation, and native support for separate private buckets with signed URLs.
2. **AWS S3 + CloudFront**: Industry standard; highly reliable but incurs high egress data transfer fees and complex image optimization pipeline setup (Lambda@Edge).
3. **Cloudinary / Uploadcare**: Turnkey image management SaaS; convenient but expensive at scale with strong vendor lock-in.

## Decision
Adopt **Cloudflare R2 (S3-Compatible Object Storage)** with **Cloudflare CDN & Image Optimization** partitioned into two isolated storage buckets:

1. **Public Bucket (`gamerperu-public-media`)**:
   - Stores catalog images, 3D renders, brand logos, and marketing video clips.
   - Connected to public CDN domain (`media.gamerperu.com`).
   - Dynamic on-the-fly image optimization generating responsive WebP and AVIF variants based on client `Accept` headers and viewport sizes.
   - Long-lived cache headers (`Cache-Control: public, max-age=31536000, immutable`).
2. **Private Bucket (`gamerperu-private-proofs`)**:
   - Stores customer Yape/Plin payment vouchers and proof screenshots.
   - Completely closed to public HTTP access (no custom domain, zero CDN caching, no public directory listing).
   - Access is restricted exclusively to authenticated admin staff via **time-limited pre-signed URLs** (5-minute expiration) generated on-demand by server-side verification actions after verifying the admin's `orders:verify` permission.
   - File uploads enforced with strict MIME type validation (JPEG, PNG, WebP only) and a strict 5MB size limit.

## Consequences
- **Positive**: Zero data egress fees, maximum security for financial vouchers, lightning-fast edge media delivery for customers in Peru, full S3 API compatibility.
- **Negative**: Requires maintaining two separate bucket configurations and generating pre-signed URLs for admin order review.

## Security / SEO / Performance Impact
- **Security**: Complete physical and logical separation of sensitive customer payment proofs from public marketing assets.
- **SEO**: Product images delivered from a clean, custom media subdomain with descriptive semantic URLs and fast LCP loading.
- **Performance**: Edge caching and AVIF/WebP compression drastically reduce bandwidth and mobile payload sizes.

## Migration / Reversal
Because Cloudflare R2 provides full S3 API compatibility and standard blob storage, media assets can be migrated to AWS S3, Google Cloud Storage, or MinIO with zero application code changes beyond updating endpoint credentials.
