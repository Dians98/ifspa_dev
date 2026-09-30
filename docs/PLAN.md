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
- **Etudiant** : `matricule` (unique), `nom`, `prenoms`, `sexe`, `dateNaissance`, `lieuNaissance`, `cin?`, `telephone`, `email?`, `adresse`, `photo?` (pas de tuteur : notion retirée à la demande du client), `filiereId`, `anneeEntreeId`, `statut` (`ACTIF` | `DIPLOME` | `ABANDON` | `EXCLU`), `dateSortie?`, `motifSortie?`
- **Inscription** (une par étudiant et par année scolaire) : `etudiantId`, `anneeScolaireId`, `niveau`, `redoublement` (bool), `droitsEnTranches` (1, 2 ou 3), `statut` (`EN_COURS` | `ADMIS` | `REDOUBLE` | `DIPLOME` | `ABANDON`), `operationAdmissionId?`
- **Echeance** : générée à l'inscription à partir du Tarif. Le montant est copié au moment de la génération, pour qu'un changement de tarif ne modifie pas le passé. Champs : `inscriptionId`, `type` (`DROITS` | `MENSUALITE`), `tranche?` (1 à 3 pour les droits), `mois` (date du 1er du mois d'exigibilité), `montantDu`.
  - **Droits d'inscription en 1, 2 ou 3 fois** (demande du client) : choix fait à l'inscription (`Inscription.droitsEnTranches`, 1 par défaut). Tranches égales arrondies au millier, le reste sur la 1re (ex. 100 000 en 3 fois = 34 000 + 33 000 + 33 000). Exigibles : 1re tranche en octobre (à l'inscription), 2e en novembre, 3e en décembre. Au passage en année supérieure, le choix de l'année précédente est repris ; il reste modifiable sur la fiche tant qu'aucune tranche n'est payée.
  - **Où et quand encaisser les droits** : au guichet, sur l'écran Encaisser, comme les mensualités. Ordre de solde : pour chaque mois, la tranche de droits éventuelle puis la mensualité. Un nouvel étudiant paie ses droits (ou la 1re tranche) juste après son inscription ; un étudiant qui passe en année supérieure paie ceux de la nouvelle année à la rentrée d'octobre.
- **Paiement** : `numeroRecu` (unique), `etudiantId`, `date`, `montant`, `mode` (`ESPECES` | `MOBILE_MONEY`), `operateur?` (`MVOLA` | `ORANGE` | `AIRTEL`), `reference?`, `observation?`, `saisiParId`, `annule`, `annuleParId?`, `motifAnnulation?`
- **PaiementLigne** : `paiementId`, `echeanceId`, `montant`. Répartit un paiement sur les échéances, de la plus ancienne à la plus récente. **Pas de paiement partiel** (retiré à la demande du client) : un paiement solde toujours des échéances entières, donc `PaiementLigne.montant` = `Echeance.montantDu` et le montant du paiement est la somme des mois cochés. Pas d'acompte, pas de montant libre. **Pas de notion d'« arriérés »** (retirée à la demande du client) : les impayés d'une année restent dus sur cette année, rien n'est reporté sur l'année suivante.
- **Compteur** : `cle` (ex. `MATRICULE:IF:2026`, `RECU:2026`), `valeur`. Incrémenté de façon atomique dans une transaction (`UPDATE … RETURNING`).
- **OperationAdmission** : `anneeSourceId`, `anneeCibleId`, `filiereId`, `niveauSource`, `creeParId`, `date`, `annulee`, `annuleeParId?`, `dateAnnulation?`, avec des lignes (`etudiantId`, `decision`, `inscriptionSourceId`, `inscriptionCibleId?`, `ancienStatutEtudiant`)
- ~~JournalAudit~~ : **retiré à la demande du client.** Pas de journal d'audit. Les annulations restent tracées sur l'objet lui-même : `annulePar`, `dateAnnulation`, motif.

**Règles clés**
- Le matricule est généré à la création : `{Filiere.code}-{AnneeEntree.anneeDebut}-{séquence sur 4 chiffres}`.
- Une échéance est soit **payée**, soit **en retard** (mois passé, non payée), soit **à venir**. Il n'existe pas d'état « partiel ». Les droits (ou leur 1re tranche) sont dus à l'inscription.
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
  - identité et contact de l'étudiant (pas de tuteur) ;
  - filière et matricule ;
  - **parcours** : une ligne par année scolaire (niveau, admis ou redoublant) ;
  - **situation de l'écolage** : grille mois par mois pour chaque année (payé, en retard, à venir), total dû, total payé, reste ;
  - historique des paiements avec les reçus ;
  - boutons **Encaisser**, **Imprimer la fiche**, et **Sortie** (admin).
- **Encaisser** (UX simplifiée à la demande du client ; maquette `prototype/encaissement.html`). On choisit des mois, pas un montant. Une seule colonne en 4 gestes, **sans fenêtre de confirmation** :
  1. **Quel étudiant ?** Grande recherche (nom, prénoms, matricule, accents ignorés) avec la liste « Derniers servis ».
  2. **Que paie-t-il ?** Les échéances non soldées s'affichent en cases. Celles **en retard sont cochées par défaut**. Le cochage se fait dans l'ordre, puisque les plus anciennes sont soldées d'abord. Le montant se calcule seul et **ne se modifie pas** : chaque mois se paie en entier, pas d'acompte.
  3. **Comment ?** Espèces ou Mobile Money. L'opérateur et la référence ne sont demandés que pour le Mobile Money.
  4. **Un seul bouton**, qui dit ce qu'il fait : « Encaisser 160 000 Ar et imprimer le reçu ». Le ticket s'imprime et l'écran se remet à zéro pour le parent suivant.
- **Encaissement hors ligne** (demande du client, **uniquement l'écran Encaisser**) : maquette `prototype/encaissement.html?hors-ligne=1`, captures `06d` et `m06d`.
  - Application installable (PWA, service worker) : l'écran Encaisser et ses ressources restent disponibles sans Internet. Les autres écrans affichent « Connexion nécessaire ».
  - **Pas de copie complète de la base sur le poste** : le navigateur garde (IndexedDB) une copie légère de ce dont le guichet a besoin, à savoir les étudiants actifs, leurs échéances non soldées et les tarifs, rafraîchie à chaque synchronisation. S'y ajoute une **file des paiements en attente**.
  - **Numéros de reçu** : chaque poste réserve à l'avance un bloc de numéros (ex. 20) dans le `Compteur`, en transaction. Un ticket imprimé hors ligne porte donc son numéro définitif. Un bloc non utilisé en fin d'année laisse des numéros « non utilisés », listés dans Paiements.
  - **Synchronisation** : bandeau d'état (vert « En ligne · tout est synchronisé », orange « Hors ligne · n paiements en attente », bleu « Synchronisation… »). Elle est automatique au retour de la connexion (événement `online`) puis toutes les 5 minutes, et manuelle avec le bouton « Synchroniser ». Chaque paiement porte un identifiant unique généré sur le poste, ce qui rend un double envoi sans effet (idempotence).
  - **Au serveur** : chaque paiement envoyé est revalidé. Si une échéance a été soldée ailleurs entre-temps, le paiement est enregistré mais signalé « à vérifier » à l'administrateur, qui l'annule ou le régularise. L'argent reçu n'est jamais perdu.
  - La session doit rester valide hors ligne : un poste déconnecté ne redemande pas le mot de passe avant la synchronisation.
- **Paiements** : historique des paiements du jour et de la période ; annulation réservée à l'admin.
- **Impayés** : liste des étudiants en retard avec le montant et le nombre de mois de retard, export Excel.
- **Passage en année supérieure** (admissions, écran refait à la demande du client ; maquette `prototype/admissions.html`, captures `12a` à `12h` et `m12`). Principe : **tous les étudiants sont cochés, on décoche ceux qui ne passent pas**.
  - Les années sont déduites automatiquement (année courante vers la suivante), il n'y a rien à choisir. En haut à droite, l'avancement : « 2 classes validées sur 6 ».
  - À gauche, la liste des **classes** (filière × niveau) avec l'effectif et l'état : « À faire », « Validée » ou « Tarif manquant ». Ce dernier état est bloquant et renvoie vers les tarifs.
  - À droite, la classe choisie : les étudiants **par ordre alphabétique**, chacun avec une **case cochée** (« Passe en 2e année », ou « Diplômé(e) » en dernière année). Décocher un étudiant le passe en « Redouble » par défaut, avec un choix Redouble / Abandon sur sa ligne, surlignée en rose. Une recherche dans la classe et un filtre « Ne passent pas (n) » aident à s'y retrouver. Les impayés sont indiqués pour information ; ils restent dus sur l'année en cours.
  - Une **barre collante** résume « 40 passent en 2e année · 1 redouble · 1 abandon » avec le bouton « Valider les Infirmier(e)s 1re année ». **Une seule confirmation**, qui liste **nommément** les étudiants qui ne passent pas. La classe passe ensuite à « Validée » (liste figée) et l'écran passe à la classe suivante. L'admin peut annuler depuis la classe validée ou depuis l'historique.

  L'opération s'exécute dans une transaction : création des inscriptions et des échéances, mise à jour des statuts. **L'historique des opérations** permet à l'admin d'**annuler** une opération : les inscriptions créées sont supprimées et les statuts restaurés. L'annulation est bloquée si des paiements ont été saisis sur ces inscriptions, et le message liste les paiements à annuler d'abord.
- **Paramètres** (admin) : filières, années scolaires (dont l'année courante), tarifs par filière, année et niveau, utilisateurs.

## Charte graphique

Le point de départ est le **rose et le bleu du paramédical**, en variantes adoucies, avec beaucoup de blanc.

**Répartition** : 60 % de blanc et de neutres clairs, 30 % de bleu (sidebar, header, boutons principaux), 10 % de rose en accent (badges, survols, éléments décoratifs de la landing).

**Couleurs de statut distinctes du rose** : vert = payé, rouge franc = en retard, gris = à venir. L'orange (`--attention`) sert uniquement aux avertissements (tarif manquant, taux de recouvrement bas), jamais à un statut de paiement. Un accent rose ne doit jamais pouvoir être confondu avec une alerte de retard.

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
- ~~QR code et page publique de vérification~~ : **retirés à la demande du client.**
- Un reçu annulé est réimprimé avec un filigrane **ANNULÉ**.
- **Format ticket : petite imprimante thermique de reçus, rouleau 80 mm** (option 58 mm), monochrome. **Pas d'A4 ni d'A5.**
  - Une seule colonne, un logo en niveaux de gris, des séparateurs en tirets.
  - Pas de zones signature ni cachet.
  - Un double pour l'institut en option.
  - Impression : `@page { size: 80mm auto; margin: 0 }`.
  - Maquette : `prototype/recu.html`.

**2. Relevé d'écolage** (`/api/pdf/releve/[etudiantId]`, format A4)
- identité de l'étudiant, matricule, filière, statut ;
- **pour chaque année scolaire** du parcours : le niveau (avec la mention « redoublant » s'il y a lieu), puis un tableau mois par mois (dû, payé, reste, statut : payé, **en retard**, à venir) et un sous-total ;
- **récapitulatif général** : total dû, total payé, **reste à payer**, nombre de mois en retard ;
- la liste des paiements avec les n° de reçu ;
- ce document sert aussi pour les parents et les relances individuelles.

**Relevé et liste des impayés** : le relevé montre les impayés d'**un** étudiant. La page **Impayés** liste **tous** les étudiants en retard, pour savoir qui relancer. Elle n'a pas de PDF dédié : on garde l'affichage à l'écran et l'export Excel.

## Dashboard proposé

Un filtre global permet de choisir l'année scolaire et la filière.

**Indicateurs (cartes)**
Trois cartes seulement :
1. Effectif actif, avec le détail par filière
2. **Taux de recouvrement en %** (encaissé / attendu à date), avec une jauge
3. Nombre d'étudiants en retard (au moins un mois impayé)

Retirés à la demande du client, à ne pas réintroduire : « Encaissements du mois en cours », « Encaissé sur l'année », « Reste à recouvrer ».

Pas de graphiques : uniquement des cartes, des tableaux et des listes.

**Tableau récapitulatif**
- Une ligne par filière et par niveau : effectif, attendu à date, encaissé, reste, taux de recouvrement en %, nombre d'étudiants en retard

**Listes**
- 10 derniers paiements

« Plus gros impayés » : **retiré à la demande du client**. La page Impayés suffit. Ne pas le réintroduire.

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
- [x] Galerie photo (section `#galerie`) : diaporama shadcn Carousel (Embla) avec flèches, compteur, légende et vignettes, sans défilement automatique. Composant `src/components/landing/galerie.tsx`, liste des photos `PHOTOS_GALERIE` dans `src/app/page.tsx`, images dans `public/images/galerie/`.
- [ ] Remplacer les photos d'illustration Pexels (`public/images/illustration/`) par les vraies photos de l'institut
- [ ] Page `/connexion`
- [ ] `proxy.ts` (redirection vers `/connexion` si pas de session) et `src/lib/permissions.ts` (`requireSession`, `requireRole`)
- [ ] Layout de l'application : sidebar, menu utilisateur, déconnexion

### Prototype de présentation client ✅
- [x] Maquettes HTML navigables de toute l'application, avec données fictives, dans `prototype/`. Point d'entrée : `prototype/index.html`. Deux comptes de démonstration : Administrateur et Secrétariat.
- [x] Captures PNG de tous les écrans, sur ordinateur et sur mobile, dans `prototype/captures/`.
- Ces maquettes servent de référence visuelle pour les phases suivantes : styles communs dans `prototype/assets/app.css`, calculs dans `prototype/assets/data.js`.

### Phase 2 — Paramètres (admin)

**Paramétrage initial par le seed** (décision du 30/09/2026) : le développeur ne saisit rien dans l'application. `prisma/seed.ts` crée :
- les filières IF et SF sur 3 ans ;
- l'année scolaire courante ;
- les tarifs de chaque filière et niveau : droits d'inscription + **10 mensualités, une année d'écolage durant 10 mois, d'octobre à juillet** ;
- le premier compte administrateur.

L'administrateur de l'institut ajuste ensuite lui-même dans Paramètres. Les écrans doivent donc être compréhensibles par un non-informaticien. L'inscription et l'admission sont bloquées, avec un message clair, si le tarif concerné manque.

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
- [ ] Reçu au format ticket thermique 80 mm (58 mm en option), sans QR code
- [ ] Droits d'inscription en 1, 2 ou 3 tranches
- [ ] Encaissement hors ligne : PWA, copie locale légère (IndexedDB), file d'attente, blocs de numéros de reçu, synchronisation automatique et manuelle
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
- **Montants réels des tarifs** : le seed utilise des montants d'exemple (100 000 Ar de droits, 80 000 Ar par mois × 10). Ils sont à remplacer dans le seed avant la mise en ligne si on les connaît, sinon l'admin les corrige dans Paramètres.
- **E-mail du premier compte administrateur** (variable `SEED_ADMIN_EMAIL`) : à fournir avant le déploiement.
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
  - répartition d'un paiement : plusieurs mois d'un coup, toujours des échéances entières ; refus d'un montant qui ne correspond pas à des mois entiers ;
  - calcul des retards à une date donnée ;
  - montant en lettres ;
  - admission puis annulation, qui doit restaurer exactement l'état d'avant.
- **Parcours manuel** :
  1. Se connecter en admin et créer une année et des tarifs.
  2. Créer 3 étudiants et vérifier les matricules `IF-2026-0001`, `IF-2026-0002` et `SF-2026-0001` (la séquence est propre à chaque filière).
  3. Encaisser deux mois et vérifier la grille. Imprimer le reçu : vérifier le logo, le montant en lettres et le reste à payer. Couper Internet, encaisser, rétablir, puis vérifier la synchronisation. Imprimer le relevé d'écolage.
  4. Lancer une admission avec 2 admis et 1 redoublant, puis l'annuler et vérifier que l'état est restauré.
  5. Se connecter en USER et vérifier qu'aucun bouton de suppression ou d'annulation n'apparaît, et que l'appel direct à la Server Action est refusé.
- `npm run build` et `npm run lint` sans erreur avant chaque fin de phase.
