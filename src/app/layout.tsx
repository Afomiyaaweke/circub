import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "circub · Connect, share, and grow your network",
  description: "A social marketplace to discover, share, and trade country-specific product prices with your network.",
  keywords: ["circub", "marketplace", "product pricing", "country pricing", "trade", "social network"],
  authors: [{ name: "circub Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "circub",
    description: "Connect, share, and grow your personalized network of product prices.",
    siteName: "circub",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "circub",
    description: "Connect, share, and grow your personalized network of product prices.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
