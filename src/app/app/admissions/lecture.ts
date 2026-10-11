import { cache } from "react";
import { lireEcranAdmissions } from "@/server/lectures/admissions";

// Le layout et la page lisent le même écran : une seule lecture par requête.
export const lireEcran = cache(() => lireEcranAdmissions());
