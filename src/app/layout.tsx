import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Analytics } from "@vercel/analytics/next";
import { PwaRegister } from "@/components/pwa-register";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

// v114 SEO: every absolute URL (OG, twitter, canonical, JSON-LD) must resolve
// against the PRODUCTION origin - without metadataBase Next.js falls back to
// localhost and social cards / search results break silently.
// v238: origin fixed to the CANONICAL host circubawd.vercel.app (the old
// circub.vercel.app hostname 301-redirects to it - canonicals, OG URLs and
// JSON-LD @ids must never point at a redirecting domain), and the title /
// description / keywords / structured data now carry the market research
// positioning so Google ranks circubAwd for what it is: the fastest way to
// research real prices and real answers in any city.
export const metadata: Metadata = {
  metadataBase: new URL("https://circubawd.vercel.app"),
  title: "circubAwd · Market research in minutes - real prices and answers from locals",
  description: "The best market research tool is the crowd that lives there. Real local prices, cash-bounty questions answered in minutes, an AI price scanner, itemized proforma estimates and registered sellers - free on circubAwd.",
  keywords: ["market research", "market research tool", "best market research tool", "price intelligence", "consumer insights", "field research", "real local prices", "travel prices", "what things cost", "verified locals", "community prices", "find local businesses", "proforma", "registered sales", "circubAwd"],
  authors: [{ name: "circubAwd Team" }],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "circubAwd",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  // v115: Google Search Console ownership verification (HTML tag method).
  // Renders <meta name="google-site-verification" content="..."/> in the head
  // of every server-rendered page - Search Console only needs it on the
  // homepage of the property, the field scopes it sitewide for free.
  verification: {
    google: "k4y2XXT7oVqj2RFHW2DErwumylcLCunw9gsFo9ld3ts",
  },
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-64.png", type: "image/png", sizes: "64x64" },
      { url: "/favicon-256.png", type: "image/png", sizes: "256x256" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "circubAwd · Market research in minutes - real prices and answers from locals",
    description: "The best market research tool is the crowd that lives there. Real local prices, cash-bounty questions answered in minutes, an AI price scanner, itemized proforma estimates and registered sellers - free on circubAwd.",
    url: "/",
    siteName: "circubAwd",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "circubAwd - know what things actually cost while you travel, from the locals",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "circubAwd · Market research in minutes - real prices and answers from locals",
    description: "The best market research tool is the crowd that lives there. Real local prices, cash-bounty questions answered in minutes, an AI price scanner, itemized proforma estimates and registered sellers - free on circubAwd.",
    images: ["/og-image.png"],
  },
};

// v114 AI/SEO: sitewide structured data. Three schema.org entities so both
// classic search engines and AI answer engines (ChatGPT search, Perplexity,
// Google AI Overviews, Copilot) can quote circubAwd accurately: the site
// itself, the installable application, and the organization behind it.
// Facts only - no invented ratings, no invented numbers.
const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://circubawd.vercel.app/#website",
      "name": "circubAwd",
      "url": "https://circubawd.vercel.app/",
      "inLanguage": "en",
      "description":
        "Market research in minutes: locals post real prices for products, services, restaurants and transport, answer cash-bounty questions, and the community votes so accurate data rises to the top.",
    },
    {
      "@type": "WebApplication",
      "@id": "https://circubawd.vercel.app/#app",
      "name": "circubAwd",
      "url": "https://circubawd.vercel.app/",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Any (installable web app - Android, iOS, desktop)",
      "browserRequirements": "Requires JavaScript",
      "description":
        "The fastest market research tool for any city: real local prices, cash-bounty questions answered by locals in minutes, an AI price scanner, an itemized proforma cost estimator, on-demand research talent, and registered sellers. Free, no app store needed.",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD",
      },
      "featureList": [
        "Price intelligence - real local prices posted by locals",
        "Cash-bounty questions answered by locals in minutes",
        "AI price scanner (PriceLens)",
        "Itemized proforma cost estimator",
        "On-demand research panel - verified local talents",
        "Community votes and ratings to surface accurate data",
        "Registered sellers with name and ratings behind every post",
      ],
      "publisher": {
        "@type": "Organization",
        "@id": "https://circubawd.vercel.app/#org",
      },
    },
    {
      "@type": "Organization",
      "@id": "https://circubawd.vercel.app/#org",
      "name": "circubAwd",
      "url": "https://circubawd.vercel.app/",
      "logo": "https://circubawd.vercel.app/logo.png",
      "email": "support@tenetbid.com",
    },
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#059669",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          {/* Sitewide structured data - server-rendered into every page's HTML */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSON_LD) }}
          />
          {children}
          <Toaster />
          <Analytics />
          <PwaRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
