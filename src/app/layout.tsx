import type { Metadata } from "next";
import { Figtree, Source_Serif_4 } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
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
  title: {
    default: "IFSPA — Institut de Formation Supérieur des Paramédicaux Atsinanana",
    template: "%s · IFSPA",
  },
  description:
    "Établissement supérieur privé de formation paramédicale à Toamasina : filières Infirmier(e)s et Sage-femmes, domaine « Science de la Santé ».",
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
