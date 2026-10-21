import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Toaster } from "../components/toaster";
import { APP_NAME } from "../lib/config";

// The variables are read by the font tokens in app/tokens.generated.css.
// Geist runs 400 to 600: regular for text, medium for headings and buttons, semibold for the logo strip.
const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], weight: ["400", "500"] });
const instrumentSerif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: `${APP_NAME} · A month of LinkedIn posts in your voice`,
  description: "Plan a month of LinkedIn posts in your own voice. Review and approve every post before it publishes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" data-scroll-behavior="smooth" className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}>
      {/* Browser extensions (Grammarly and the like) add attributes to body before hydration. */}
      <body suppressHydrationWarning>{children}<Toaster /></body>
    </html>
  );
}
