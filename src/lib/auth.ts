import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { db } from "@/lib/db";

// Routes HTTP du plugin admin fermées (404) : elles contourneraient les gardes des Server Actions
// (dernier admin, soi-même). `disabledPaths` ne filtre que le routeur HTTP ; `auth.api.*` reste utilisable côté serveur.
const ROUTES_ADMIN_FERMEES = [
  "/admin/set-role",
  "/admin/get-user",
  "/admin/create-user",
  "/admin/update-user",
  "/admin/list-users",
  "/admin/list-user-sessions",
  "/admin/unban-user",
  "/admin/ban-user",
  "/admin/impersonate-user",
  "/admin/stop-impersonating",
  "/admin/revoke-user-session",
  "/admin/revoke-user-sessions",
  "/admin/remove-user",
  "/admin/set-user-password",
  "/admin/has-permission",
];

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  disabledPaths: ROUTES_ADMIN_FERMEES,
  emailAndPassword: {
    enabled: true,
    // Pas d'inscription publique : seuls les admins créent les comptes.
    disableSignUp: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 12, // 12 h
    updateAge: 60 * 60, // prolongée toutes les heures d'activité
  },
  plugins: [
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    nextCookies(), // doit rester le dernier plugin
  ],
});

export type Session = typeof auth.$Infer.Session;
