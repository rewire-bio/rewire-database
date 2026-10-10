import type { Metadata } from "next";
import Header from "@/components/header";
import Footer from "@/components/Footer";
import "./globals.css";
import { Archivo, Newsreader, IBM_Plex_Mono } from "next/font/google";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

// Every page renders on request from the running revision's data pin, so a
// data release is adopted without rebuilding. The edge caches the HTML.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL("https://benchmarks.rewirebio.io"),
  title: { default: "Biological model benchmarks | rewirebio.io", template: "%s" },
  description:
    "Biological models, evaluation protocols, published results and reproducible rewirebio.io benchmark runs.",
  authors: [{ name: "Tim Richardson" }],
  publisher: "rewirebio.io",
  alternates: { canonical: "https://benchmarks.rewirebio.io/" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${archivo.variable} ${newsreader.variable} ${plexMono.variable}`}
    >
      <body className="flex flex-col min-h-screen">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Header />
        <main id="main-content" tabIndex={-1} className="flex-grow">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
