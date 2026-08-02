import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { THEME_COOKIE } from "@/lib/state/cookies";
import "@/styles/global.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OurSay",
  description: "OurSay — verified, auditable civic participation.",
  applicationName: "OurSay",
  appleWebApp: {
    title: "OurSay",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/site.webmanifest",
};

/** Lock zoom and keep the keyboard from resizing the fixed app frame. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "overlays-content",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Seed the theme class server-side from the cookie so the first paint already
  // matches the saved preference (no light→dark flash). AppProvider re-syncs it.
  const dark = (await cookies()).get(THEME_COOKIE)?.value === "dark";

  return (
    <html
      lang="en"
      className={`${inter.variable}${dark ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
