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
export const metadata: Metadata = {
  metadataBase: new URL("https://circub.vercel.app"),
  title: "circub · Know what things actually cost while you travel, from the locals",
  description: "Locals post real prices for products, services, restaurants, transport and more. Travelers get verified, up-to-date local knowledge · and can ask a local directly when they can't find what they need.",
  keywords: ["circub", "local prices", "travel prices", "what things cost", "verified locals", "community prices", "travel intelligence", "local knowledge"],
  authors: [{ name: "circub Team" }],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "circub",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
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
    title: "circub · Know what things actually cost while you travel, from the locals",
    description: "Locals post real prices for products, services, restaurants, transport and more. Travelers get verified, up-to-date local knowledge · and can ask a local directly when they can't find what they need.",
    url: "/",
    siteName: "circub",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "circub - know what things actually cost while you travel, from the locals",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "circub · Know what things actually cost while you travel, from the locals",
    description: "Locals post real prices for products, services, restaurants, transport and more. Travelers get verified, up-to-date local knowledge · and can ask a local directly when they can't find what they need.",
    images: ["/og-image.png"],
  },
};

// v114 AI/SEO: sitewide structured data. Three schema.org entities so both
// classic search engines and AI answer engines (ChatGPT search, Perplexity,
// Google AI Overviews, Copilot) can quote circub accurately: the site
// itself, the installable application, and the organization behind it.
// Facts only - no invented ratings, no invented numbers.
const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://circub.vercel.app/#website",
      "name": "circub",
      "url": "https://circub.vercel.app/",
      "inLanguage": "en",
      "description":
        "Locals post real prices for products, services, restaurants, transport and more. Travelers see what things actually cost before and while they travel.",
    },
    {
      "@type": "WebApplication",
      "@id": "https://circub.vercel.app/#app",
      "name": "circub",
      "url": "https://circub.vercel.app/",
      "applicationCategory": "TravelApplication",
      "operatingSystem": "Any (installable web app - Android, iOS, desktop)",
      "browserRequirements": "Requires JavaScript",
      "description":
        "Know what things actually cost while you travel, from the locals. Real local prices, an AI price scanner, ask-a-local messaging, local guides, and a trip budget planner. Free, no app store needed.",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD",
      },
      "featureList": [
        "Real local prices posted by locals",
        "AI price scanner (PriceLens)",
        "Ask a local directly when a price is missing",
        "Local guides with star ratings",
        "Trip budget planner",
        "Community votes and ratings to surface accurate prices",
      ],
      "publisher": {
        "@type": "Organization",
        "@id": "https://circub.vercel.app/#org",
      },
    },
    {
      "@type": "Organization",
      "@id": "https://circub.vercel.app/#org",
      "name": "circub",
      "url": "https://circub.vercel.app/",
      "logo": "https://circub.vercel.app/logo.png",
      "email": "support@tenetbid.com",
    },
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#16a34a",
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
