import type { Metadata } from "next";
import Header from "@/components/header";
import Footer from "@/components/Footer";
import "./globals.css";
import { Archivo, Newsreader, IBM_Plex_Mono } from "next/font/google";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-newsreader", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://benchmarks.rewire.it"),
  title: { default: "Biological model benchmarks | rewire.it", template: "%s" },
  description: "Biological models, evaluation protocols, published results and reproducible rewire.it benchmark runs.",
  authors: [{ name: "Tim Richardson" }],
  publisher: "rewire.it",
  alternates: { canonical: "https://benchmarks.rewire.it/" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" dir="ltr" className={`${archivo.variable} ${newsreader.variable} ${plexMono.variable}`}>
    <body className="flex flex-col min-h-screen"><Header /><main className="flex-grow">{children}</main><Footer /></body>
  </html>;
}
