import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import { LazyToaster } from "@/components/ui/lazy-toaster";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext", "vietnamese"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "latin-ext", "vietnamese"],
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "LimGrow Tracking",
  title: {
    default: "LimGrow Tracking",
    template: "%s | LimGrow Tracking",
  },
  description:
    "Operations console for mobile events, in-app purchases and Firebase topics",
  robots: {
    follow: false,
    index: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${inter.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
        <LazyToaster />
      </body>
    </html>
  );
}
