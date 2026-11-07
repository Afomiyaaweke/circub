// ============================================================================
// v117: page.tsx is now a SERVER component so shared price-post links get
// per-post Open Graph metadata. Every share / copy / QR of a price post now
// points at /?post=<postId>, and when a crawler (WhatsApp, Facebook, X,
// Telegram, iMessage) fetches that URL, generateMetadata below swaps the
// generic site card for the post's own photo, product name and price range.
//
// The photo itself is served by /api/local-prices/<id>/image: uploads are
// base64 data: URLs in the DB, which crawlers cannot fetch, so the route
// decodes them and serves real bytes.
//
// The interactive app shell (unchanged client behavior) lives in
// home-client.tsx - including the deep-link handler that auto-opens the
// price detail modal for ?post= links.
// ============================================================================
import type { Metadata } from "next";
import { formatUnitSuffix } from "@/lib/utils";
import HomeClient from "./home-client";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const sp = await searchParams;
  const raw = sp.post;
  const postId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : null;
  if (!postId) return {}; // plain visit - layout defaults apply

  try {
    // v244 PERF: db is lazy-imported here instead of a top-level import.
    // A top-level `import { db }` instantiated the PrismaClient (and spawned
    // its query engine) on EVERY cold start of `/` - even though plain
    // visits never run a query - stretching the first HTML byte on a phone
    // by the full engine boot. Only /?post=<id> share-link crawls pay for
    // the DB now; every other cold start skips Prisma entirely.
    const { db } = await import("@/lib/db");
    const post = await db.localPricePost.findUnique({
      where: { id: postId },
      select: {
        productName: true,
        currency: true,
        priceMin: true,
        priceMax: true,
        unit: true,
        city: true,
        country: true,
        postType: true,
        imageUrl: true,
      },
    });
    if (!post) return {}; // unknown/deleted post - layout defaults apply

    const place = [post.city, post.country].filter(Boolean).join(", ");
    const range =
      post.priceMin === post.priceMax
        ? `${post.currency} ${post.priceMin.toLocaleString("en-US")}${formatUnitSuffix(post.unit)}`
        : `${post.currency} ${post.priceMin.toLocaleString("en-US")} - ${post.priceMax.toLocaleString("en-US")}${formatUnitSuffix(post.unit)}`;
    const kind = post.postType === "SERVICE" ? "service" : "product";
    const title = `${post.productName} - ${range} · real local price on circubAwd`;
    const description = `Locals report this ${kind}${place ? ` in ${place}` : ""} costs ${range}. See the full price details, GPS directions and community votes on circubAwd.`;
    // Uploaded photos are data: URLs (crawler-invisible) - the image route
    // serves them as real bytes. Posts without a photo keep the sitewide
    // og:image from the root layout.
    const image = post.imageUrl ? `/api/local-prices/${postId}/image` : undefined;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `/?post=${postId}`,
        siteName: "circubAwd",
        type: "website",
        images: image ? [{ url: image }] : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: image ? [image] : undefined,
      },
    };
  } catch {
    return {}; // DB hiccup - layout defaults apply, page still renders
  }
}

// v239 PERF: the three real community counts moved to GET /api/landing-stats
// and are fetched CLIENT-side by the landing stats band. This page used to
// await three Prisma queries before sending a single byte - on a cold Vercel
// serverless DB that stretched first paint to multiple seconds for EVERY
// visitor, which read as "the app is laggy". The homepage render now touches
// no database at all; the stats band fills in without ever blocking paint
// (and the endpoint edge-caches for 2 minutes).
export default async function Home() {
  return <HomeClient />;
}
