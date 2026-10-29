#!/bin/bash
# Installe sur cPanel la version déposée par GitHub Actions (.github/workflows/deploiement.yml).
# Lancé chaque minute par cron : ~/ifspa-deploy/deployer.sh. Ne fait rien tant qu'aucun fichier .ready n'est déposé.
# Étapes : sauvegarde de la base, migrations manquantes, bascule de ~/ifspa-app, contrôle, retour arrière si le site ne répond pas.
set -u -o pipefail

DEPOT="$HOME/ifspa-deploy"
APP="$HOME/ifspa-app"
VERSIONS="$HOME/ifspa-releases"
SITE="https://ifspa.mg"

mkdir -p "$DEPOT/incoming" "$DEPOT/status" "$DEPOT/sauvegardes" "$VERSIONS"
exec 9>"$DEPOT/.verrou"
flock -n 9 || exit 0

# L'archive est déposée avant son .ready : un .ready présent garantit une archive complète.
pret=$(ls -1t "$DEPOT"/incoming/*.ready 2>/dev/null | head -1)
[ -n "$pret" ] || exit 0
version=$(basename "$pret" .ready)
archive="$DEPOT/incoming/$version.zip"
rm -f "$DEPOT"/incoming/*.ready

exec >>"$DEPOT/status/$version.log" 2>&1
statut() { echo "$1" > "$DEPOT/status/$version.statut"; echo "== $(date '+%F %T') $1"; }
echouer() { echo "$1"; statut "${2:-ECHEC}"; exit 1; }

statut EN_COURS
[ -f "$archive" ] || echouer "Archive $version.zip absente."

set -a; . "$APP/.env.production"; set +a
# libpq refuse le paramètre ?schema= de Prisma.
BASE="${DATABASE_URL%%\?*}"

neuve="$VERSIONS/$version"
rm -rf "$neuve" && mkdir -p "$neuve" && unzip -q "$archive" -d "$neuve" || echouer "Décompression impossible."
cp "$APP/.env.production" "$neuve/.env.production" && chmod 600 "$neuve/.env.production"

echo "Sauvegarde de la base"
pg_dump "$BASE" --no-owner --no-privileges | gzip > "$DEPOT/sauvegardes/avant-$version.sql.gz" || echouer "Sauvegarde de la base impossible : rien n'est installé."
ls -1t "$DEPOT"/sauvegardes/*.sql.gz | tail -n +11 | xargs -r rm -f

# Même registre que `prisma migrate deploy` (_prisma_migrations), qui reste utilisable plus tard.
for dossier in $(ls -1d "$neuve"/deploy/migrations/*/ 2>/dev/null | sort); do
  nom=$(basename "$dossier")
  [ "$(psql "$BASE" -Atc "SELECT 1 FROM _prisma_migrations WHERE migration_name = '$nom' AND finished_at IS NOT NULL")" = 1 ] && continue
  echo "Migration $nom"
  # Une migration qui échoue au milieu est annulée entière : la base reste sur l'ancien schéma.
  psql "$BASE" -q -v ON_ERROR_STOP=1 --single-transaction -f "$dossier/migration.sql" \
    || echouer "Migration $nom en échec : version non installée. Sauvegarde : sauvegardes/avant-$version.sql.gz"
  psql "$BASE" -q -v ON_ERROR_STOP=1 -c "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
    VALUES ('$(cat /proc/sys/kernel/random/uuid)', '$(sha256sum "$dossier/migration.sql" | cut -d' ' -f1)', now(), '$nom', now(), 1)" \
    || echouer "Migration $nom appliquée mais non enregistrée."
done

precedente="$VERSIONS/precedente-$(date +%Y%m%d-%H%M%S)"
mv "$APP" "$precedente" || echouer "Bascule impossible."
mv "$neuve" "$APP" || { mv "$precedente" "$APP"; echouer "Bascule impossible."; }
mkdir -p "$APP/tmp" && touch "$APP/tmp/restart.txt"

# Premier démarrage de Passenger : quelques secondes.
code=000
for essai in 1 2 3 4 5 6; do
  sleep 10
  code=$(curl -s -o /dev/null -m 60 -w '%{http_code}' "$SITE/connexion")
  [ "$code" = 200 ] && break
done

if [ "$code" != 200 ]; then
  echo "Le site répond $code : retour à la version précédente."
  mv "$APP" "$VERSIONS/echec-$version" && mv "$precedente" "$APP"
  mkdir -p "$APP/tmp" && touch "$APP/tmp/restart.txt"
  uapi NginxCaching clear_cache >/dev/null
  echouer "Version $version refusée, ancienne version rétablie (les migrations jouées restent en place)." ECHEC_RETABLI
fi

uapi NginxCaching clear_cache >/dev/null
cp "$APP/deploy/deployer.sh" "$DEPOT/deployer.sh" && chmod 700 "$DEPOT/deployer.sh"
rm -f "$archive"
ls -1dt "$VERSIONS"/precedente-* 2>/dev/null | tail -n +4 | xargs -r rm -rf
ls -1t "$DEPOT"/status/*.log 2>/dev/null | tail -n +21 | xargs -r rm -f
statut OK
