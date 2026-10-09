import {
  Banknote,
  GraduationCap,
  LayoutDashboard,
  Receipt,
  Settings,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/roles";

export type EntreeMenu = {
  /** Identifiant stable (clés React, futurs états hors ligne). */
  id: string;
  libelle: string;
  href: string;
  icone: LucideIcon;
  /** Entrée masquée pour le rôle `user` (la vérification serveur reste obligatoire). */
  adminSeulement?: boolean;
  /** Action principale du guichet : mise en avant en rose. */
  principale?: boolean;
  /** Écran utilisable sans connexion. Les autres seront grisés hors ligne (à venir). */
  disponibleHorsLigne?: boolean;
};

export type GroupeMenu = { id: string; libelle: string; entrees: EntreeMenu[] };

/** Source unique du menu principal : chemins, libellés, droits. */
export const NAVIGATION: GroupeMenu[] = [
  {
    id: "pilotage",
    libelle: "Pilotage",
    entrees: [{ id: "dashboard", libelle: "Tableau de bord", href: "/app/dashboard", icone: LayoutDashboard }],
  },
  {
    id: "scolarite",
    libelle: "Scolarité",
    entrees: [
      { id: "etudiants", libelle: "Étudiants", href: "/app/etudiants", icone: Users },
      { id: "admissions", libelle: "Passage en année supérieure", href: "/app/admissions", icone: GraduationCap },
    ],
  },
  {
    id: "ecolage",
    libelle: "Écolage",
    entrees: [
      { id: "encaisser", libelle: "Encaisser", href: "/app/encaisser", icone: Banknote, principale: true, disponibleHorsLigne: true },
      { id: "paiements", libelle: "Paiements", href: "/app/paiements", icone: Receipt },
      { id: "impayes", libelle: "Impayés", href: "/app/impayes", icone: TriangleAlert },
    ],
  },
  {
    id: "administration",
    libelle: "Administration",
    entrees: [
      { id: "parametres", libelle: "Paramètres", href: "/app/parametres", icone: Settings, adminSeulement: true },
    ],
  },
];

/** Menu visible pour un rôle : retire les entrées réservées à l'admin et les groupes vides. */
export function navigationPour(role: Role): GroupeMenu[] {
  return NAVIGATION.map((groupe) => ({
    ...groupe,
    entrees: groupe.entrees.filter((e) => role === "admin" || !e.adminSeulement),
  })).filter((groupe) => groupe.entrees.length > 0);
}

/** Une entrée est active sur sa page et sur toutes les pages qui en dépendent (/app/etudiants/123). */
export function estActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
