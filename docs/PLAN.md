# Plan — Application de gestion IFSPA (suivi de l'écolage)

## Contexte

L'**IFSPA** (Institut de Formation Supérieur des Paramédicaux Atsinanana, Toamasina) suit aujourd'hui l'écolage de ses étudiants dans Excel, ce qui devient ingérable. Objectif : une application web qui gère chaque étudiant de l'inscription à la sortie (diplôme, abandon, exclusion). Elle couvre :
- un matricule unique et stable ;
- le suivi mois par mois de l'écolage sur toute la scolarité ;
- le passage d'année en lot (admis ou redoublant), avec vérification avant validation et annulation possible par l'admin ;
- deux rôles, dont un qui ne peut rien supprimer ;
- un dashboard ;
- une landing page publique qui présente l'institut.

Source officielle : `LOGO ET ARRËTEE IFSPA.pdf` (logo et arrêtés : ouverture n°04460/2011, habilitation n°15482/2011, équivalence n°23915/2011, renouvellement n°056/2024).

### Décisions validées avec l'utilisateur
| Sujet | Choix |
|---|---|
| Écolage | Droits d'inscription annuels + mensualités sur N mois (par défaut 10 mois, d'octobre à juillet) |
| Durée des études | Configurable par filière |
| Filières | **Infirmier(e)s** (code `IF`) et **Sage-femmes** (code `SF`). D'autres filières pourront être ajoutées dans Paramètres. |
| Matricule | `IF-2026-0001` / `SF-2026-0001` : code filière, année d'entrée, séquence par filière et par année. Il ne change jamais, même si l'étudiant redouble. |
| Paiements | Espèces, Mobile Money (MVola, Orange Money, Airtel Money, avec la référence de transaction) |
| Reçu | PDF numéroté (`R-2026-00001`) avec logo et montant en lettres |
| Remises | Aucune : même tarif pour une même filière, une même année scolaire et un même niveau |
| Hébergement | cPanel (Node.js App + PostgreSQL + SSH), sans Docker. Docker sert seulement à Postgres en développement. Node ≥ 20.9 requis (22 idéalement), version du cPanel à vérifier. |

## Fonctionnement : CLAUDE.md et docs/PLAN.md

- **`CLAUDE.md`** (racine) : chargé automatiquement dans chaque session Claude Code. Il reste court et stable : stack, commandes, conventions de code, règles métier clés (matricule, rôles, pas de suppression physique des paiements), et un lien vers PLAN.md.
- **`docs/PLAN.md`** (ce fichier) : la spec détaillée et la feuille de route par phases, avec des cases à cocher mises à jour au fil du développement.

## Stack

- **Next.js** (dernière version stable, App Router, TypeScript, Server Actions), **Tailwind CSS v4**, **shadcn/ui** (DataTable avec TanStack Table, Dialog, Form, Card)
- **PostgreSQL 17** : en Docker (`docker-compose.yml`) en développement, fourni par cPanel en production
- **Prisma** (ORM et migrations)
- **Better Auth** (email et mot de passe, sessions en base, champ `role`)
- **Zod** et **react-hook-form** pour la validation ; **date-fns** en locale `fr`
- **@react-pdf/renderer** pour les reçus
- Montants en **Ariary**, stockés en entiers (`Int`, sans décimales)
- **Vitest** pour la logique métier

## Modèle de données (Prisma)

- **User** : `name`, `email`, `role` (`ADMIN` | `USER`), `actif`. Les tables d'authentification sont gérées par Better Auth.
- **Filiere** : `code` (ex. `IF`, `SF`, unique, 2 à 3 lettres), `nom`, `dureeAnnees`, `actif`
- **AnneeScolaire** : `libelle` (`2026-2027`), `anneeDebut` (2026), `dateDebut`, `dateFin`, `moisDebutEcolage` (10 = octobre), `estCourante`, `cloturee`
- **Tarif** : `filiereId`, `anneeScolaireId`, `niveau`, `droitsInscription`, `montantMensuel`, `nombreMois`. Unicité sur (filière, année scolaire, niveau).
- **Etudiant** : `matricule` (unique), `nom`, `prenoms`, `sexe`, `dateNaissance`, `lieuNaissance`, `cin?`, `telephone`, `email?`, `adresse`, `tuteurNom`, `tuteurTelephone`, `photo?`, `filiereId`, `anneeEntreeId`, `statut` (`ACTIF` | `DIPLOME` | `ABANDON` | `EXCLU`), `dateSortie?`, `motifSortie?`
- **Inscription** (une par étudiant et par année scolaire) : `etudiantId`, `anneeScolaireId`, `niveau`, `redoublement` (bool), `statut` (`EN_COURS` | `ADMIS` | `REDOUBLE` | `DIPLOME` | `ABANDON`), `operationAdmissionId?`
- **Echeance** : générée à l'inscription à partir du Tarif. Le montant est copié au moment de la génération, pour qu'un changement de tarif ne modifie pas le passé. Champs : `inscriptionId`, `type` (`DROITS` | `MENSUALITE`), `mois` (date du 1er du mois), `montantDu`
- **Paiement** : `numeroRecu` (unique), `etudiantId`, `date`, `montant`, `mode` (`ESPECES` | `MOBILE_MONEY`), `operateur?` (`MVOLA` | `ORANGE` | `AIRTEL`), `reference?`, `observation?`, `saisiParId`, `annule`, `annuleParId?`, `motifAnnulation?`
- **PaiementLigne** : `paiementId`, `echeanceId`, `montant`. Répartit un paiement sur les échéances, de la plus ancienne à la plus récente par défaut, avec la possibilité de choisir les mois. **Pas de notion d'« arriérés »** (retirée à la demande du client) : les impayés d'une année restent dus sur cette année, rien n'est reporté sur l'année suivante.
- **Compteur** : `cle` (ex. `MATRICULE:IF:2026`, `RECU:2026`), `valeur`. Incrémenté de façon atomique dans une transaction (`UPDATE … RETURNING`).
- **OperationAdmission** : `anneeSourceId`, `anneeCibleId`, `filiereId`, `niveauSource`, `creeParId`, `date`, `annulee`, `annuleeParId?`, `dateAnnulation?`, avec des lignes (`etudiantId`, `decision`, `inscriptionSourceId`, `inscriptionCibleId?`, `ancienStatutEtudiant`)
- ~~JournalAudit~~ : **retiré à la demande du client.** Pas de journal d'audit. Les annulations restent tracées sur l'objet lui-même : `annulePar`, `dateAnnulation`, motif.

**Règles clés**
- Le matricule est généré à la création : `{Filiere.code}-{AnneeEntree.anneeDebut}-{séquence sur 4 chiffres}`.
- Une échéance est en retard si son mois est passé et qu'elle n'est pas entièrement payée. Les droits d'inscription sont dus à l'inscription.
- Aucune suppression physique de paiement. L'admin **annule** le paiement avec un motif : le reçu reste dans l'historique, marqué ANNULÉ.

## Rôles et permissions

Les permissions sont vérifiées **côté serveur** dans chaque Server Action (`requireRole()` dans `src/lib/permissions.ts`), pas seulement en masquant les boutons.

| Action | USER | ADMIN |
|---|:-:|:-:|
| Consulter étudiants, fiches, dashboard | ✅ | ✅ |
| Créer et modifier un étudiant | ✅ | ✅ |
| Enregistrer un paiement, imprimer un reçu | ✅ | ✅ |
| Lancer une admission en lot | ✅ | ✅ |
| Supprimer quoi que ce soit | ❌ | ✅ |
| Annuler un paiement | ❌ | ✅ |
| Annuler une opération d'admission | ❌ | ✅ |
| Enregistrer une sortie (abandon, exclusion) | ❌ | ✅ |
| Paramètres (filières, années, tarifs, utilisateurs) | ❌ | ✅ |

## Écrans

**Public**
- `/` : landing page. Header avec logo et bouton **Se connecter**. Hero, présentation de l'institut, filières, agréments (arrêtés du PDF), contact et localisation à Toamasina, footer.
- `/connexion` : formulaire de connexion.

**Application** (`/app/...`, sidebar, protégée par middleware)
- **Dashboard** (voir ci-dessous)
- **Étudiants** : liste avec recherche (nom ou matricule) et filtres (filière, niveau, année, statut, « en retard »). Bouton **Nouvel étudiant**.
- **Fiche étudiant** (`/app/etudiants/[id]`) :
  - identité et tuteur ;
  - filière et matricule ;
  - **parcours** : une ligne par année scolaire (niveau, admis ou redoublant) ;
  - **situation de l'écolage** : grille mois par mois pour chaque année (payé, partiel, en retard, à venir), total dû, total payé, reste ;
  - historique des paiements avec les reçus ;
  - boutons **Encaisser**, **Imprimer la fiche**, et **Sortie** (admin).
- **Paiements** : saisie rapide (recherche de l'étudiant, montant, mode et répartition proposée), historique des paiements du jour et de la période, reçu PDF.
- **Impayés** : liste des étudiants en retard avec le montant et le nombre de mois de retard, export Excel.
- **Admissions** : en 3 étapes.
  1. **Choix du lot** : année source, année cible, filière et niveau.
  2. **Liste** : un étudiant par ligne avec case à cocher. Pour chacun, la décision (Admis N+1, Redoublant, ou Diplômé si c'est le dernier niveau) et un aperçu de son solde impayé.
  3. **Vérification** : un dialogue récapitule le nombre d'admis, de redoublants et de diplômés, et affiche les alertes : tarif manquant pour l'année cible, étudiant déjà inscrit dans l'année cible, impayés. L'utilisateur confirme ensuite.
  L'opération s'exécute dans une transaction : création des inscriptions et des échéances, mise à jour des statuts. **L'historique des opérations** permet à l'admin d'**annuler** une opération : les inscriptions créées sont supprimées et les statuts restaurés. L'annulation est bloquée si des paiements ont été saisis sur ces inscriptions, et le message liste les paiements à annuler d'abord.
- **Paramètres** (admin) : filières, années scolaires (dont l'année courante), tarifs par filière, année et niveau, utilisateurs.

## Charte graphique

Le point de départ est le **rose et le bleu du paramédical**, en variantes adoucies, avec beaucoup de blanc.

**Répartition** : 60 % de blanc et de neutres clairs, 30 % de bleu (sidebar, header, boutons principaux), 10 % de rose en accent (badges, survols, éléments décoratifs de la landing).

**Couleurs de statut distinctes du rose** : vert = payé, orange = partiel, rouge franc = en retard. Un accent rose ne doit jamais pouvoir être confondu avec une alerte de retard.

**Tokens** : toutes les couleurs sont des variables CSS (tokens shadcn : `--primary`, `--accent`, etc.) dans `src/app/globals.css`, avec 3 thèmes candidats sous `[data-theme="..."]` :
| Thème | Principal | Secondaire | Accent | Fond |
|---|---|---|---|---|
| `nuit-rose` | bleu nuit `#1E3A5F` | bleu acier `#4A7FB5` | rose poudré `#D4798C` | blanc |
| `ciel-corail` | bleu médical `#0F6CA8` | bleu ciel du logo `#5BB5E0` | corail rosé `#E97B84` | blanc |
| `sarcelle-vieux-rose` | sarcelle `#0F5E6E` | sarcelle clair `#2A9D8F` | vieux rose `#B9737F` | blanc cassé `#FCFBF9` |

**Page de démo** (`/demo-palette`, visible seulement en développement) : un sélecteur de thème en haut, puis un aperçu réel de la landing, d'une page de l'application (sidebar, tableau, badges de statut, boutons) et d'un reçu. L'utilisateur choisit sur ce rendu, on ne garde que le thème choisi et on supprime la page de démo.

**PDF** : sobres, lisibles aussi en noir et blanc. Le logo est en couleur, les titres et les bordures de tableau dans la couleur principale, tout le reste en noir et gris.

## Impression et documents PDF

Les PDF sont générés côté serveur avec `@react-pdf/renderer`. Le bouton **Imprimer** ouvre le PDF dans un iframe caché et lance `print()`, donc la boîte d'impression du navigateur s'ouvre directement vers l'imprimante. Le bouton **Télécharger** enregistre le PDF.

**En-tête commun** (`src/pdf/EnTete.tsx`) :
- logo IFSPA en couleur, nom complet de l'institut, adresse et contact à Toamasina ;
- en petit, les références d'agrément : arrêtés n°04460/2011 et n°15482/2011, renouvellement n°056/2024.

**Pied de page** : date d'édition, page X/Y, mention « Document généré par l'application IFSPA ».

**1. Reçu de paiement** (`/api/pdf/recu/[id]`)
- n° de reçu, date et heure ;
- étudiant : matricule, nom et prénoms, filière, niveau, année scolaire ;
- détail des lignes payées (droits d'inscription, octobre 2026, novembre 2026, etc.) avec les montants ;
- **total en chiffres et en lettres** (« cent cinquante mille ariary ») ;
- mode de paiement, opérateur et référence Mobile Money ;
- **reste à payer après ce paiement** ;
- nom du caissier, zones « Signature » et « Cachet » ;
- **QR code** vers `/verification/recu/[numero]`, une page publique qui confirme que le reçu existe et n'est pas annulé, pour lutter contre les faux reçus.
- Un reçu annulé est réimprimé avec un filigrane **ANNULÉ**.
- **Format ticket : petite imprimante thermique de reçus, rouleau 80 mm** (option 58 mm), monochrome. **Pas d'A4 ni d'A5.**
  - Une seule colonne, un logo en niveaux de gris, des séparateurs en tirets.
  - Pas de zones signature ni cachet.
  - Un double pour l'institut en option.
  - Impression : `@page { size: 80mm auto; margin: 0 }`.
  - Maquette : `prototype/recu.html`.

**2. Relevé d'écolage** (`/api/pdf/releve/[etudiantId]`, format A4)
- identité de l'étudiant, matricule, filière, statut ;
- **pour chaque année scolaire** du parcours : le niveau (avec la mention « redoublant » s'il y a lieu), puis un tableau mois par mois (dû, payé, reste, statut : payé, partiel, **en retard**) et un sous-total ;
- **récapitulatif général** : total dû, total payé, **reste à payer**, nombre de mois en retard ;
- la liste des paiements avec les n° de reçu ;
- ce document sert aussi pour les parents et les relances individuelles.

**Relevé et liste des impayés** : le relevé montre les impayés d'**un** étudiant. La page **Impayés** liste **tous** les étudiants en retard, pour savoir qui relancer. Elle n'a pas de PDF dédié : on garde l'affichage à l'écran et l'export Excel.

## Dashboard proposé

Un filtre global permet de choisir l'année scolaire et la filière.

**Indicateurs (cartes)**
1. Effectif actif, avec le détail par filière
2. Encaissé sur l'année et attendu à date, avec le **taux de recouvrement en %**
3. Reste à recouvrer (échéances échues non payées)
4. Nombre d'étudiants en retard (au moins un mois impayé)

« Encaissements du mois en cours » : **retiré à la demande du client** (non utile). Ne pas le réintroduire.

Pas de graphiques : uniquement des cartes, des tableaux et des listes.

**Tableau récapitulatif**
- Une ligne par filière et par niveau : effectif, attendu à date, encaissé, reste, taux de recouvrement en %, nombre d'étudiants en retard

**Listes**
- Top 10 des plus gros impayés, avec un lien vers la fiche
- 10 derniers paiements

## Arborescence prévue

```
ifspa/
  CLAUDE.md
  docs/PLAN.md
  docker-compose.yml            # postgres (dev uniquement)
  prisma/schema.prisma, prisma/seed.ts   # admin initial, 2 filières, année courante, tarifs d'exemple
  public/logo-ifspa.png          # extrait du PDF
  src/app/(public)/page.tsx      # landing
  src/app/connexion/page.tsx
  src/app/app/{dashboard,etudiants,etudiants/[id],paiements,impayes,admissions,parametres/*}/
  src/app/api/pdf/{recu,releve}/[id]/route.ts   # génération des PDF
  src/app/verification/recu/[numero]/page.tsx   # vérification publique (QR code)
  src/pdf/{EnTete,Recu,Releve}.tsx              # gabarits @react-pdf
  src/lib/{db,auth,permissions,matricule,ecolage,montant-en-lettres}.ts
  src/server/actions/{etudiants,paiements,admissions,parametres}.ts
  src/components/{ui (shadcn), app, landing}/
  tests/                         # vitest
```

Le cœur métier est dans des fonctions pures et testables :
- `src/lib/matricule.ts` : format et génération du matricule
- `src/lib/ecolage.ts` : génération des échéances, répartition des paiements, calcul des retards et des soldes
- `src/lib/montant-en-lettres.ts` : conversion en français (ex. « cent cinquante mille ariary »)

## Feuille de route

### Phase 0 — Initialisation ✅
- [x] Next.js 16, Tailwind v4, shadcn/ui (radix-nova) et composants de base
- [x] Postgres 17 via `docker-compose.yml` (port 5434)
- [x] Prisma 7 : schéma complet, migration `init`, client dans `src/generated/prisma`
- [x] Better Auth (email et mot de passe, plugin admin, inscription publique désactivée), route `/api/auth/[...all]`
- [x] Seed : admin, filières IF et SF, année 2026-2027, tarifs d'exemple
- [x] Vitest configuré, scripts npm
- [x] CLAUDE.md et docs/PLAN.md

### Phase 1 — Charte, landing et connexion
- [x] Extraire le logo du PDF vers `public/brand/logo-ifspa.png` (fond transparent)
- [x] Direction visuelle choisie via impeccable : « standard des écoles », palette bleu nuit + rose poudré (tokens dans `globals.css`, thèmes alternatifs conservés)
- [ ] Page `/demo-palette` (facultative)
- [x] Landing page (header avec logo et « Se connecter », hero, bandeau d'agrément, présentation, filières, agréments, contact, footer)
- [x] Formulaire de contact (section « Nous contacter ») :
  - fichiers : `src/components/landing/formulaire-contact.tsx` et l'action `src/server/actions/contact.ts` ;
  - anti-robot :
    - **Cloudflare Turnstile**, gratuit : widget `src/components/landing/turnstile.tsx`, vérification serveur dans `src/lib/turnstile.ts`, variables `NEXT_PUBLIC_TURNSTILE_SITE_KEY` et `TURNSTILE_SECRET_KEY`. En développement, sans clés, les clés de test Cloudflare s'appliquent ;
    - un champ piège invisible en plus ;
  - envoi : API SMTP2GO (`src/lib/email.ts`, variables `SMTP2GO_API_KEY`, `EMAIL_EXPEDITEUR`, `CONTACT_DESTINATAIRE`). Sans clé, l'envoi est simulé en développement.
- [ ] Créer le compte SMTP2GO (gratuit), vérifier l'expéditeur et renseigner les variables en production
- [ ] Créer un widget Turnstile dans Cloudflare (gratuit), avec le domaine du site, et renseigner les deux clés en production
- [ ] Remplacer les photos d'illustration Pexels (`public/images/illustration/`) par les vraies photos de l'institut
- [ ] Page `/connexion`
- [ ] `proxy.ts` (redirection vers `/connexion` si pas de session) et `src/lib/permissions.ts` (`requireSession`, `requireRole`)
- [ ] Layout de l'application : sidebar, menu utilisateur, déconnexion

### Prototype de présentation client ✅
- [x] Maquettes HTML navigables de toute l'application, avec données fictives, dans `prototype/`. Point d'entrée : `prototype/index.html`. Deux comptes de démonstration : Administrateur et Secrétariat.
- [x] Captures PNG de tous les écrans, sur ordinateur et sur mobile, dans `prototype/captures/`.
- Ces maquettes servent de référence visuelle pour les phases suivantes : styles communs dans `prototype/assets/app.css`, calculs dans `prototype/assets/data.js`.

### Phase 2 — Paramètres (admin)
- ~~Établissement~~ : **pas d'écran de paramétrage, à la demande du client.** Les coordonnées (adresse, téléphone, courriel, NIF/STAT, devise) utilisées par la landing et les PDF sont renseignées une fois pour toutes dans `src/lib/etablissement.ts` ou par le seed de la table `Etablissement`.
- [ ] Filières, années scolaires (année courante), tarifs par filière, année et niveau
- [ ] Utilisateurs : création, rôle, désactivation, réinitialisation du mot de passe

### Phase 3 — Étudiants
- [ ] `src/lib/matricule.ts` et `src/lib/ecolage.ts` (génération des échéances), avec leurs tests
- [ ] Création : matricule automatique, première inscription et échéances, en transaction
- [ ] Liste avec recherche et filtres, fiche étudiant, modification

### Phase 4 — Écolage
- [ ] Répartition des paiements et calcul des retards et soldes (`ecolage.ts`), avec leurs tests
- [ ] `montant-en-lettres.ts`, avec ses tests
- [ ] Encaissement (saisie rapide et depuis la fiche), numérotation des reçus
- [ ] Reçu au format ticket thermique 80 mm (58 mm en option), QR code, page `/verification/recu/[numero]`
- [ ] Relevé d'écolage PDF A4, impression directe
- [ ] Annulation d'un paiement par l'admin, filigrane ANNULÉ
- [ ] Page Impayés et export Excel

### Phase 5 — Admissions et sorties
- [ ] Assistant en 3 étapes (lot, liste à cocher, vérification) et exécution en transaction
- [ ] Historique des opérations et annulation par l'admin (bloquée s'il existe des paiements), avec les tests
- [ ] Sorties : abandon et exclusion (admin)

### Phase 6 — Dashboard
- [ ] Cartes d'indicateurs, tableau par filière et par niveau, top des impayés, derniers paiements (sans graphiques)

### Phase 7 — Reprise des données Excel
Script `scripts/import-excel.ts`, lancé par `npm run import -- fichier.xlsx`, avec la librairie `exceljs`.
   - Il lit le fichier Excel actuel. Les colonnes seront adaptées une fois le fichier vu.
   - Il crée les étudiants, puis les inscriptions et les échéances, puis les paiements.
   - Les étudiants déjà en place reçoivent un matricule attribué par ordre d'inscription.
   - Un mode `--dry-run` produit un rapport (lignes importées, lignes rejetées avec la raison) sans rien écrire en base.
   - Il peut être relancé sans créer de doublons : on détecte les étudiants déjà importés par nom, prénoms et date de naissance.
   - Prérequis : déposer le fichier Excel dans `C:\wamp64\www\ifspa\data\`.

### Phase 8 — Déploiement cPanel
- [ ] Vérifier la version de Node proposée par « Setup Node.js App » : au moins 20.9, idéalement 22
- [ ] Créer la base PostgreSQL et son utilisateur dans cPanel
- [ ] Ajouter `output: "standalone"` dans `next.config.ts` ; faire le build en local sur le PC de dev
- [ ] Envoyer par SSH ou SFTP le dossier `.next/standalone`, `.next/static` et `public/`
- [ ] Configurer « Setup Node.js App » : fichier de démarrage `server.js`, et variables d'environnement `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` et `NEXT_PUBLIC_APP_URL` avec le vrai domaine
- [ ] Lancer `npx prisma migrate deploy` en SSH, puis le seed une seule fois
- [ ] HTTPS via AutoSSL ; sauvegardes via les outils de cPanel

## Points ouverts (sans bloquer le démarrage)

- **Durée de chaque filière** : 3 ans dans le seed, modifiable dans Paramètres.
- **Contenu de la landing** : adresse, téléphone, email, photos, texte de présentation. On met des textes provisoires en attendant.
- **Fichier Excel actuel** : nécessaire pour la phase 7.
- **Palette définitive** : elle sera choisie sur la page de démo (voir « Charte graphique »).
- **Infos de l'en-tête des PDF** : adresse, téléphone, email, NIF et STAT éventuels.
- Hypothèse par défaut : un **USER** peut lancer une admission, seul l'**ADMIN** peut l'annuler. On pourra restreindre si besoin.

## Vérification

- `docker compose up -d`, puis `npx prisma migrate dev` et `npx prisma db seed`, puis `npm run dev`
- **Tests unitaires (Vitest)** :
  - matricule : format, séquence, unicité quand plusieurs créations arrivent en même temps ;
  - échéances : génération à partir du tarif ;
  - répartition d'un paiement : partiel, trop-perçu, plusieurs mois d'un coup ;
  - calcul des retards à une date donnée ;
  - montant en lettres ;
  - admission puis annulation, qui doit restaurer exactement l'état d'avant.
- **Parcours manuel** :
  1. Se connecter en admin et créer une année et des tarifs.
  2. Créer 3 étudiants et vérifier les matricules `IF-2026-0001`, `IF-2026-0002` et `SF-2026-0001` (la séquence est propre à chaque filière).
  3. Encaisser un paiement partiel et vérifier la grille. Imprimer le reçu : vérifier le logo, le montant en lettres et le reste à payer, puis scanner le QR code et vérifier que la page de vérification s'affiche. Imprimer le relevé d'écolage.
  4. Lancer une admission avec 2 admis et 1 redoublant, puis l'annuler et vérifier que l'état est restauré.
  5. Se connecter en USER et vérifier qu'aucun bouton de suppression ou d'annulation n'apparaît, et que l'appel direct à la Server Action est refusé.
- `npm run build` et `npm run lint` sans erreur avant chaque fin de phase.
