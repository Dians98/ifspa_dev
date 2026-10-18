import { BarreLaterale } from "@/components/app/barre-laterale";
import { EnTeteApp } from "@/components/app/en-tete-app";
import { InscriptionServiceWorker } from "@/components/app/inscription-service-worker";
import { SidebarProvider } from "@/components/ui/sidebar";
import { requireSession, roleDe } from "@/lib/permissions";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <SidebarProvider style={{ "--sidebar-width": "17rem" } as React.CSSProperties}>
      <a
        href="#contenu"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium text-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Aller au contenu
      </a>
      <InscriptionServiceWorker utilisateurId={session.user.id} />
      <BarreLaterale utilisateurId={session.user.id} nom={session.user.name} role={roleDe(session)} />
      <div className="flex min-w-0 flex-1 flex-col bg-muted">
        <EnTeteApp />
        <main id="contenu" className="mx-auto w-full max-w-350 flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
