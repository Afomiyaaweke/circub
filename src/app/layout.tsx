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
  title: "circub · Know what things actually cost while you travel, from the locals",
  description: "Locals post real prices for products, services, restaurants, transport and more. Travelers get verified, up-to-date local knowledge · and can ask a local directly when they can't find what they need.",
  keywords: ["circub", "local prices", "travel prices", "what things cost", "verified locals", "community prices", "travel intelligence", "local knowledge"],
  authors: [{ name: "circub Team" }],
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
    siteName: "circub",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "circub · Know what things actually cost while you travel, from the locals",
    description: "Locals post real prices for products, services, restaurants, transport and more. Travelers get verified, up-to-date local knowledge · and can ask a local directly when they can't find what they need.",
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
