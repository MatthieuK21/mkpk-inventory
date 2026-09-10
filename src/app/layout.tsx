import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const font = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "MKPK Inventaire",
  description: "Inventaire photo simple : uploader, classer, retrouver.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${font.variable} h-full`}>
      <body className={`${font.className} min-h-full antialiased`}>
        {children}
      </body>
    </html>
  );
}
