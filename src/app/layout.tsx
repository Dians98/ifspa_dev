import type { Metadata } from "next";
import { Figtree, Source_Serif_4 } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DESCRIPTION_SITE, TITRE_SITE, URL_SITE } from "@/lib/site";
import "./globals.css";

const texte = Figtree({
  variable: "--font-texte",
  subsets: ["latin"],
});

const titre = Source_Serif_4({
  variable: "--font-titre",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(URL_SITE),
  title: { default: TITRE_SITE, template: "%s · IFSPA" },
  description: DESCRIPTION_SITE,
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "IFSPA",
    title: TITRE_SITE,
    description: DESCRIPTION_SITE,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${texte.variable} ${titre.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
