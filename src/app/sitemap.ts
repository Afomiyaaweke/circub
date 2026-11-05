import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

// v238 SEO: the sitemap now points at the REAL production origin.
// History: v114 shipped https://circub.vercel.app, but that hostname is only
// a Vercel alias that 301-redirects to https://circubawd.vercel.app. Every
// URL a search engine read from the old sitemap pointed at a redirecting
// domain instead of the canonical one - the classic way to tell Google to
// index "the other site". All URLs below are canonical now.
//
// v238 also makes the sitemap DYNAMIC: every registered talent gets their
// public /g/<username> profile page (server-rendered, per-talent metadata,
// ratings and specialties) listed, so Google can index the actual research
// panel - one extra indexed page per talent. Static pages + /help round out
// the list. If the DB hiccups, the static list is returned untouched so the
// route can never 500.
const BASE = "https://circubawd.vercel.app";

// Query the LIVE database on every request (v239): the route was being
// prerendered at build time, so talents registered after a deploy only
// showed up in the sitemap on the NEXT deploy.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${BASE}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${BASE}/help`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.8,
    },
    {
      url: `${BASE}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${BASE}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  try {
    // Public talent profile pages: server-rendered, indexable, with real
    // per-talent metadata (name, role, location, rating). Only registered
    // talents with a username get a page, matching what /g/<username> serves.
    const talents = await db.user.findMany({
      where: { isGuide: true, username: { not: null } },
      select: { username: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5000,
    });
    return [
      ...staticRoutes,
      ...talents.map((t) => ({
        url: `${BASE}/g/${t.username}`,
        lastModified: t.updatedAt ?? now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
    ];
  } catch {
    return staticRoutes;
  }
}
