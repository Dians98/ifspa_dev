#!/usr/bin/env bash
# Déroule les étapes de ETAPES dans l'ordre, continue après un échec, écrit le bilan dans /resultats.
set -u -o pipefail
cd /app

ETAPES=",${ETAPES:-lint,vitest,build,typecheck,e2e,e2e-build},"
RES=/resultats
mkdir -p "$RES"
find "$RES" -mindepth 1 -delete
BILAN="$RES/bilan.txt"
echecs=0
build_ok=1

veut() { [[ "$ETAPES" == *",$1,"* ]]; }

etape() {
  local nom=$1; shift
  local debut=$SECONDS statut
  echo
  echo "=== $nom ==="
  if "$@" 2>&1 | tee "$RES/$nom.log"; then statut="OK"; else statut="ECHEC"; echecs=$((echecs + 1)); fi
  printf '%-10s %-6s %4ss\n' "$nom" "$statut" "$((SECONDS - debut))" | tee -a "$BILAN"
  [[ $statut == OK ]]
}

sauter() { printf '%-10s %-6s (%s)\n' "$1" "SAUTE" "$2" | tee -a "$BILAN"; }

preparer() { pnpm exec prisma migrate deploy && pnpm prisma db seed; }

# Sur `next dev`, comme en local : sur le build, la limite de connexion de Better Auth (production seulement)
# bloque les navigateurs qui partagent 127.0.0.1. Playwright réutilise ce serveur déjà chaud.
# next dev grossit au fil des pages (6,3 Go, tué par le noyau sur un passage complet) : un serveur neuf par groupe.
e2e_groupe() {
  local nom=$1; shift
  setsid pnpm dev > "$RES/serveur-$nom.log" 2>&1 &
  local pid=$! code=0
  node docker/test/chauffer.mjs || code=$?
  # Un seul navigateur : avec 3, les 8 Go de Docker Desktop saturent et les tests expirent au hasard.
  if ((code == 0)); then
    PLAYWRIGHT_HTML_OUTPUT_DIR="$RES/rapport-e2e-$nom" pnpm exec playwright test "$@" --output="test-results/$nom" \
      --workers="${E2E_WORKERS:-1}" --retries="${E2E_RETRIES:-1}" || code=$?
  fi
  kill -- -"$pid" 2>/dev/null
  while node -e 'fetch("http://localhost:3100").then(() => process.exit(0), () => process.exit(1))'; do sleep 1; done
  return $code
}

e2e_app() {
  local code=0
  e2e_groupe ordinateur --project=prototype --project=app || code=1
  e2e_groupe mobile --project=app-mobile || code=1
  return $code
}

e2e_build() {
  pnpm recette:base && pnpm recette:parcours --project build
}

recette_complete() {
  pnpm recette:base && pnpm recette:parcours --project ordinateur
}

echo "Node $(node -v), pnpm $(pnpm -v), étapes : ${ETAPES:1:-1}"
etape preparer preparer || { echo "Base e2e impossible à préparer : arrêt."; exit 1; }

veut lint && etape lint pnpm lint
veut vitest && etape vitest pnpm test
if veut build; then etape build pnpm build || build_ok=0; fi
veut typecheck && etape typecheck pnpm typecheck

if [[ ! -d .next ]]; then build_ok=0; fi
veut e2e && etape e2e e2e_app
if veut e2e-build; then
  if ((build_ok)); then etape e2e-build e2e_build; else sauter e2e-build "pas de build"; fi
fi
if veut recette; then
  if ((build_ok)); then etape recette recette_complete; else sauter recette "pas de build"; fi
fi

[[ -d test-results ]] && cp -r test-results "$RES/traces"

echo
echo "=== Bilan ==="
cat "$BILAN"
((echecs == 0))
