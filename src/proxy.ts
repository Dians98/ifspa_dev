import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { CHEMIN_CONNEXION } from "@/lib/roles";

// Premier filtre, sur la seule présence du cookie de session (rapide, sans base).
// La session est revérifiée en base par `requireSession` dans le layout de /app et dans chaque action.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const cookie = getSessionCookie(request);

  if (!cookie && pathname.startsWith("/app")) {
    const url = new URL(CHEMIN_CONNEXION, request.url);
    url.searchParams.set("retour", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
