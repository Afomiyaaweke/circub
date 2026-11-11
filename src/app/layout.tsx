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

// ============================================================================
// v260 BOOT SPLASH - the "it's like this on mobile" screenshot fix.
//
// The compiled stylesheet is ~240 KB; on a 3G phone the HTML (and its raw
// text) paints SECONDS before the CSS arrives, and because the stylesheet
// carries every `hidden` rule even desktop-only widgets (the right sidebar)
// flash on phones. Parser-order facts this relies on:
//  - <html class="circub-booting"> below is SSR STATIC - the gate is active
//    from the first painted byte, before ANY script gets to run;
//  - the body-first inline <style> is parsed before the rest of the body, so
//    the gate + splash styles apply without waiting for the stylesheet;
//  - the reveal script sits AFTER the stylesheet links, and parser-inserted
//    scripts wait for pending stylesheets - so it runs exactly when the CSS
//    finished (or failed), never earlier. The 4 s cap covers the FAILED
//    stylesheet case (listeners attach after the error already fired);
//  - <noscript> unhides everything for no-JS visitors and crawlers.
// The splash node stays in the DOM (display:none once ready) so React
// hydration always finds the exact markup it rendered.
// ============================================================================
const BOOT_STYLE = `html.circub-booting body>*:not(#circub-boot){display:none!important}
#circub-boot{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#02140c;color:#eaf2ee;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
html.circub-ready #circub-boot{display:none}
#circub-boot .circub-mark{width:58px;height:58px;border-radius:9999px;background:#14c37c;color:#02140c;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;line-height:1}
#circub-boot b{font-size:20px;letter-spacing:.2px}
#circub-boot small{font-size:13px;opacity:.72}
@keyframes circub-boot-spin{to{transform:rotate(360deg)}}
#circub-boot .circub-ring{width:44px;height:44px;border-radius:9999px;border:4px solid rgba(234,242,238,.16);border-top-color:#14c37c;animation:circub-boot-spin .9s linear infinite}`;
const BOOT_SCRIPT = `(function(){
try{
var h=document.documentElement;
var done=false;
var reveal=function(){if(done)return;done=true;h.classList.add('circub-ready');h.classList.remove('circub-booting')};
var links=document.querySelectorAll('link[rel="stylesheet"]');
var pending=0;
var onOne=function(){pending--;if(pending<=0)reveal()};
for(var i=0;i<links.length;i++){var l=links[i];pending++;if(l.sheet){onOne();continue}l.addEventListener('load',onOne,{once:true});l.addEventListener('error',onOne,{once:true})}
if(pending<=0){pending=1;setTimeout(onOne,60)}
setTimeout(reveal,4000);
}catch(e){try{document.documentElement.classList.add('circub-ready')}catch(e2){}}
})();`;

const BOOT_NOSCRIPT = `#circub-boot{display:none!important}html.circub-booting body>*:not(#circub-boot){display:revert!important}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="circub-booting">
      <body
        className={`${geistSans.variable} antialiased bg-background text-foreground`}
      >
        {/* v260 BOOT SPLASH - SSR-gated (html.circub-booting) and inline-styled
            so the gate + splash work with zero CSS and zero JS. First in the
            body so it beats every other paint; <noscript> below unhides the
            app for no-JS visitors and crawlers. */}
        <style id="circub-boot-style" dangerouslySetInnerHTML={{ __html: BOOT_STYLE }} />
        <div id="circub-boot" role="status" aria-label="circubAwd is loading">
          <div className="circub-ring" />
          <div className="circub-mark" aria-hidden="true">C</div>
          <b>circubAwd</b>
          <small>Loading local prices…</small>
        </div>
        <noscript>
          <style dangerouslySetInnerHTML={{ __html: BOOT_NOSCRIPT }} />
        </noscript>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
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
