"use client";

import { useSyncExternalStore } from "react";

function abonner(rappel: () => void) {
  window.addEventListener("online", rappel);
  window.addEventListener("offline", rappel);
  return () => {
    window.removeEventListener("online", rappel);
    window.removeEventListener("offline", rappel);
  };
}

/** Le navigateur se croit-il en ligne ? Ne déclenche aucune synchronisation (voir `useEtatHorsLigne` pour Encaisser). */
export function useEnLigne(): boolean {
  return useSyncExternalStore(
    abonner,
    () => navigator.onLine,
    () => true,
  );
}
