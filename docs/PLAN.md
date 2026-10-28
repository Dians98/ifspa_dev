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
| Retard (11/10/2026) | Une échéance du mois M non soldée passe **en retard le 1er du mois M+1**. Pendant le mois M, elle est « à venir » (ou « partielle » si un acompte est versé). |
| Inscription (11/10/2026) | **Pas d'inscription en cours d'année** : tout étudiant est inscrit à la rentrée, ses échéances couvrent toute l'année scolaire (octobre → juillet). |
| Impayés d'années antérieures (11/10/2026) | Encaisser affiche **tout ce qui est impayé**, toutes années confondues. Un paiement solde d'abord l'échéance la plus ancienne, même si elle appartient à une année précédente. |

## Ce document

`docs/PLAN.md` (ce fichier) : la spec détaillée et la feuille de route par phases, avec des cases à cocher mises à jour au fil du développement.

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
- **Paiement** : `numeroRecu` (unique), `etudiantId`, `date`, `montant`, `mode` (`ESPECES` | `MOBILE_MONEY`), `operateur?` (`MVOLA` | `ORANGE` | `AIRTEL`), `reference?`, `observation?`, `saisiParId`, `annule`, `annuleParId?`, `motifAnnulation?`, `idClient?` (unique : identifiant généré sur le poste pour l'encaissement hors ligne, rend un double envoi sans effet), `aVerifier` (paiement synchronisé alors que l'échéance avait été soldée ailleurs)
- **BlocNumeros** : bloc de numéros réservé à l'avance par un poste, pour attribuer hors ligne un numéro définitif. Sert aux reçus de l'encaissement hors ligne (clé `RECU:{annee}`) et pourra servir aux matricules (`MATRICULE:{CODE}:{annee}`). Champs : `poste`, `cle` (clé du `Compteur`), `premier`, `dernier`, `reserveParId`.
- **PaiementLigne** : `paiementId`, `echeanceId`, `montant`. Répartit un paiement sur les échéances, de la plus ancienne à la plus récente. **Paiement partiel autorisé** (rétabli à la demande du client le 01/10/2026), sur les droits comme sur les mensualités : le montant reçu est libre. Ce qui dépasse les échéances soldées va en acompte sur l'échéance suivante (l'étudiant apporte 100 000 Ar pour un mois à 80 000 Ar : le mois est soldé, 20 000 Ar d'acompte sur le mois suivant) ; un montant inférieur à une échéance la paie en partie. `PaiementLigne.montant` peut donc être inférieur à `Echeance.montantDu` ; le payé d'une échéance est la somme de ses lignes de paiements non annulés. Un montant qui dépasse le reste dû total de l'étudiant (toutes années confondues) est refusé (pas de trop-perçu). **Pas de notion d'« arriérés »** (retirée à la demande du client) : les impayés d'une année restent dus sur cette année, rien n'est reporté sur l'année suivante. Ils restent toutefois visibles et encaissables : un paiement peut couvrir des échéances de plusieurs années, de la plus ancienne à la plus récente (décision du 11/10/2026).
- **Compteur** : `cle` (ex. `MATRICULE:IF:2026`, `RECU:2026`), `valeur`. Incrémenté de façon atomique dans une transaction (`UPDATE … RETURNING`).
- **OperationAdmission** : `anneeSourceId`, `anneeCibleId`, `filiereId`, `niveauSource`, `creeParId`, `date`, `annulee`, `annuleeParId?`, `dateAnnulation?`, avec des lignes (`etudiantId`, `decision`, `inscriptionSourceId`, `inscriptionCibleId?`, `ancienStatutEtudiant`)
- ~~JournalAudit~~ : **retiré à la demande du client.** Pas de journal d'audit. Les annulations restent tracées sur l'objet lui-même : `annulePar`, `dateAnnulation`, motif.

**Règles clés**
- Le matricule est généré à la création : `{Filiere.code}-{AnneeEntree.anneeDebut}-{séquence sur 4 chiffres}`.
- Une échéance est soit **payée**, soit **partielle** (acompte versé, reste dû, mois pas encore passé), soit **en retard** (mois passé, pas entièrement payée ; on affiche le reste dû), soit **à venir**. « Mois passé » : une échéance du mois M est en retard **à partir du 1er du mois M+1** (l'échéance d'octobre non soldée est en retard le 1er novembre). La règle vaut aussi pour les tranches de droits. Les droits (ou leur 1re tranche) sont dus à l'inscription.
- **Pas d'inscription en cours d'année** : la création d'un étudiant génère toujours les échéances de l'année complète (droits et 10 mensualités d'octobre à juillet).
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
  - **situation de l'écolage** : grille mois par mois pour chaque année (payé, partiel, en retard, à venir), total dû, total payé, reste ;
  - historique des paiements avec les reçus ;
  - boutons **Encaisser**, **Imprimer la fiche**, et **Sortie** (admin).
- **Encaisser** (UX simplifiée à la demande du client ; maquette `prototype/encaissement.html`). On coche des mois, et le montant reçu reste modifiable (paiement partiel). Une seule colonne en 4 gestes, **sans fenêtre de confirmation** :
  1. **Quel étudiant ?** Grande recherche (nom, prénoms, matricule, accents ignorés) avec la liste « Derniers servis ».
  2. **Que paie-t-il ?** **Toutes** les échéances non soldées s'affichent en cases, années précédentes comprises, regroupées par année scolaire. **Aucune n'est cochée à l'ouverture** (demande de Diano du 26/10/2026) : la secrétaire coche les mois payés ou tape le montant reçu. Le cochage se fait dans l'ordre, puisque les plus anciennes sont soldées d'abord. Le champ **« Montant reçu »**, vide à l'ouverture, suit la somme des cases cochées et **reste modifiable** (paiement partiel) : s'il dépasse les cases cochées, le surplus va en acompte sur l'échéance suivante et l'écran le dit (« 20 000 Ar d'acompte sur avril, il restera 60 000 Ar ») ; s'il est inférieur, la dernière échéance n'est payée qu'en partie. Refusé s'il dépasse le reste dû total de l'étudiant.
  3. **Comment ?** Espèces ou Mobile Money. L'opérateur et la référence ne sont demandés que pour le Mobile Money.
  4. **Un seul bouton**, qui dit ce qu'il fait : « Encaisser 160 000 Ar et imprimer le reçu ». Le ticket s'imprime et l'écran se remet à zéro pour le parent suivant.
- **Encaissement hors ligne** (demande du client, **uniquement l'écran Encaisser**) : maquette `prototype/encaissement.html?hors-ligne=1`, captures `06d` et `m06d`.
  - **Rien à installer sur le poste** (pas d'application installable, pas de manifeste PWA), précision du 01/10/2026. Le seul besoin est que l'écran Encaisser fonctionne sans Internet ; les autres écrans demandent Internet et on ne fait rien pour eux. Moyen technique : un service worker minimal, invisible pour l'utilisateur, qui met en cache **uniquement** la page Encaisser et ses ressources, pour qu'elle s'ouvre et se recharge même sans connexion (cas d'une coupure de courant : le poste redémarre sans Internet).
  - **Cadre de l'application hors ligne** : le menu latéral, l'en-tête et le nom de l'utilisateur s'affichent comme en ligne (ils sont en cache avec la page). Les autres entrées du menu sont grisées avec la mention « Connexion nécessaire », et la déconnexion est désactivée tant que le poste est hors ligne ou que des paiements sont en attente.
  - **Pas de copie complète de la base sur le poste** : le navigateur garde (IndexedDB) une copie légère de ce dont le guichet a besoin, à savoir les étudiants actifs, leurs échéances non soldées et les tarifs, rafraîchie à chaque synchronisation. S'y ajoute une **file des paiements en attente**.
  - **Numéros de reçu** : chaque poste réserve à l'avance un bloc de numéros (ex. 20) dans le `Compteur`, en transaction. Un ticket imprimé hors ligne porte donc son numéro définitif. Un bloc non utilisé en fin d'année laisse des numéros « non utilisés », listés dans Paiements.
  - **Synchronisation** : bandeau d'état (vert « En ligne · tout est synchronisé », orange « Hors ligne · n paiements en attente », bleu « Synchronisation… »). Elle est automatique au retour de la connexion (événement `online`) puis toutes les 5 minutes, et manuelle avec le bouton « Synchroniser ». Chaque paiement porte un identifiant unique généré sur le poste, ce qui rend un double envoi sans effet (idempotence).
  - **Au serveur** : chaque paiement envoyé est revalidé. Si une échéance a été soldée ailleurs entre-temps, le paiement est enregistré mais signalé « à vérifier » à l'administrateur, qui l'annule ou le régularise. L'argent reçu n'est jamais perdu.
  - **Accès concurrents** : une seule synchronisation à la fois par poste, même avec deux onglets ouverts (Web Locks API) ; le prochain numéro du bloc est pris dans une transaction IndexedDB ; au serveur, l'enregistrement d'un paiement verrouille les échéances de l'inscription (`SELECT … FOR UPDATE`) avant de recalculer le reste dû. Deux postes en ligne sur la même échéance : le second est refusé avec un message clair. Un poste hors ligne : son paiement est enregistré « à vérifier ».
  - La session doit rester valide hors ligne : un poste déconnecté ne redemande pas le mot de passe avant la synchronisation.
  - **Évolution possible vers d'autres écrans** (décision du 09/10/2026 : on ne la construit pas, mais la base ne doit pas l'empêcher). Déjà prêt : identifiants `cuid` générables sur le poste, aucune suppression physique, `updatedAt` sur les modèles modifiables, blocs de numéros génériques (`BlocNumeros`, qui peut réserver des matricules comme des reçus). À ajouter le jour venu, sans risque pour les données : un `idClient` unique sur chaque table saisie hors ligne (ex. `Etudiant`) et un numéro de version pour détecter les modifications concurrentes.
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

**Couleurs de statut distinctes du rose** : vert = payé, orange = partiel (`--partiel`), rouge franc = en retard, gris = à venir. Le même orange (`--attention`) sert aussi aux avertissements (tarif manquant, taux de recouvrement bas, hors ligne). Un accent rose ne doit jamais pouvoir être confondu avec une alerte de retard.

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
- détail des lignes payées (droits d'inscription, octobre 2026, novembre 2026, etc.) avec les montants ; une échéance payée en partie porte la mention « acompte » et son reste dû ;
- **total en chiffres et en lettres** (« cent cinquante mille ariary ») ;
- mode de paiement, opérateur et référence Mobile Money ;
- **reste à payer après ce paiement** ;
- nom du caissier, zones « Signature » et « Cachet » ;
- ~~QR code et page publique de vérification~~ : **retirés à la demande du client.**
- Un reçu annulé est réimprimé avec un filigrane **ANNULÉ**.
- **Format ticket : petite imprimante thermique de reçus, rouleau 80 mm** (option 58 mm), monochrome. **Pas d'A4 ni d'A5.**
  - Une seule colonne, un logo en niveaux de gris, des séparateurs en tirets.
  - Pas de zones signature ni cachet.
  - Toujours imprimé avec un double pour l'institut (mention « DOUBLE »), sans option à cocher (demande de Diano du 25/10/2026).
  - Impression : `@page { size: 80mm auto; margin: 0 }`.
  - Maquette : `prototype/recu.html`.

**2. Relevé d'écolage** (`/api/pdf/releve/[etudiantId]`, format A4)
- identité de l'étudiant, matricule, filière, statut ;
- **pour chaque année scolaire** du parcours : le niveau (avec la mention « redoublant » s'il y a lieu), puis un tableau mois par mois (dû, payé, reste, statut : payé, partiel, **en retard**, à venir) et un sous-total ;
- **récapitulatif général** : total dû, total payé, **reste à payer**, nombre de mois en retard ;
- la liste des paiements avec les n° de reçu ;
- ce document sert aussi pour les parents et les relances individuelles.

**Relevé et liste des impayés** : le relevé montre les impayés d'**un** étudiant. La page **Impayés** liste **tous** les étudiants en retard, pour savoir qui relancer. Elle n'a pas de PDF dédié : on garde l'affichage à l'écran et l'export Excel.

## Dashboard proposé

Un filtre global permet de choisir l'année scolaire et la filière.

**Indicateurs (cartes)**
Trois cartes seulement :
1. Effectif actif, avec le détail par filière
2. **Taux de recouvrement en %** (encaissé / attendu à date), avec une jauge. « Attendu à date » : échéances dont le mois est révolu, selon la même règle que le retard.
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
- [x] docs/PLAN.md

### Phase 1 — Charte, landing et connexion
- [x] Extraire le logo du PDF vers `public/brand/logo-ifspa.png` (fond transparent)
- [x] Direction visuelle choisie : « standard des écoles », palette bleu nuit + rose poudré (tokens dans `globals.css`, thèmes alternatifs conservés)
- [ ] Page `/demo-palette` (facultative)
- [x] Landing page (header avec logo et « Se connecter », hero, bandeau d'agrément, présentation, filières, agréments, contact, footer)
- [x] Formulaire de contact (section « Nous contacter ») :
  - fichiers : `src/components/landing/formulaire-contact.tsx` et l'action `src/server/actions/contact.ts` ;
  - anti-robot :
    - **Cloudflare Turnstile**, gratuit : widget `src/components/landing/turnstile.tsx`, vérification serveur dans `src/lib/turnstile.ts`, variables `NEXT_PUBLIC_TURNSTILE_SITE_KEY` et `TURNSTILE_SECRET_KEY`. Sans clés en développement, ni widget ni vérification ; en production, les deux clés sont obligatoires ;
    - un champ piège invisible en plus ;
  - envoi : API SMTP2GO (`src/lib/email.ts`, variables `SMTP2GO_API_KEY`, `EMAIL_EXPEDITEUR`, `CONTACT_DESTINATAIRE`). Sans clé, l'envoi est simulé en développement.
- [ ] Créer le compte SMTP2GO (gratuit), vérifier l'expéditeur et renseigner les variables en production
- [x] Créer un widget Turnstile dans Cloudflare (gratuit), avec le domaine du site (09/10/2026 : clés dans le `.env` de dev ; leur place en production est décrite en phase 8)
- [x] Galerie photo (section `#galerie`) : diaporama shadcn Carousel (Embla) avec flèches, compteur, légende et vignettes, sans défilement automatique. Composant `src/components/landing/galerie.tsx`, liste des photos `PHOTOS_GALERIE` dans `src/app/page.tsx`, images dans `public/images/galerie/`.
- [ ] Remplacer les photos d'illustration Pexels (`public/images/illustration/`) par les vraies photos de l'institut
- [x] Page `/connexion`
- [x] `proxy.ts` (redirection vers `/connexion` si pas de session) et `src/lib/permissions.ts` (`requireSession`, `requireRole`)
- [x] Layout de l'application : sidebar, menu utilisateur, déconnexion

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
- [x] Filières, années scolaires (année courante), tarifs par filière, année et niveau
- [x] Utilisateurs : création, rôle, désactivation, réinitialisation du mot de passe

### Phase 3 — Étudiants ✅
- [x] `src/lib/matricule.ts` et `src/lib/ecolage.ts` (génération des échéances), avec leurs tests
- [x] Création : matricule automatique, première inscription et échéances, en transaction
- [x] Liste avec recherche et filtres, fiche étudiant, modification

### Phase 4 — Écolage
- [x] Répartition des paiements et calcul des retards et soldes (`ecolage.ts`), avec leurs tests
- [x] `montant-en-lettres.ts`, avec ses tests
- [x] Encaissement (saisie rapide et depuis la fiche), numérotation des reçus
- [x] Reçu au format ticket thermique 80 mm (58 mm en option), sans QR code
- [x] Droits d'inscription en 1, 2 ou 3 tranches
- [x] Paiement partiel : montant reçu libre, acompte sur l'échéance suivante, statut « partiel »
- [x] Encaissement hors ligne (écran Encaisser seul, rien à installer) : page en cache, copie locale légère (IndexedDB), file d'attente, blocs de numéros de reçu, synchronisation automatique et manuelle
- [x] Relevé d'écolage PDF A4, impression directe
- [x] Annulation d'un paiement par l'admin, filigrane ANNULÉ
- [x] Page Impayés et export Excel

### Phase 5 — Admissions et sorties ✅
- [x] Écran par classe (tous cochés, on décoche ceux qui ne passent pas), une seule confirmation, exécution en transaction
- [x] Historique des opérations et annulation par l'admin (bloquée s'il existe des paiements), avec les tests
- [x] Sorties : abandon et exclusion (admin)

### Phase 6 — Dashboard ✅
- [x] Trois cartes d'indicateurs, tableau par filière et par niveau, 10 derniers paiements (sans graphiques, sans « plus gros impayés »)

### Phase 7 — Reprise des données (écran d'import, admin)
- [x] Écran d'import `/app/parametres/import` (modèle téléchargeable, rapport avant écriture, import en une transaction, relance sans doublon), recetté (UC15) le 17/10/2026
- [ ] Reprise avec le vrai fichier de l'institut, d'abord sur la recette (colonnes à ajuster si besoin)
- [ ] Mesurer la durée d'un import à la limite (2 000 étudiants, 10 000 paiements) sur cPanel : la transaction est limitée à 120 s

Décision du 17/10/2026 : **un écran dans Paramètres** (`/app/parametres/import`, admin seulement) plutôt qu'un script lancé par le développeur. L'institut importe lui-même, sans accès au serveur.
- **Format imposé** : modèle `docs/modele-import/modele-import-ifspa.xlsx`, téléchargeable depuis l'écran (définition des colonnes dans `src/lib/import-modele.ts`, régénéré par `pnpm tsx scripts/modele-import.ts`). L'institut recopie son Excel actuel dans ce modèle.
  - Feuille **Étudiants** : une ligne par étudiant inscrit en 2026-2027 (N°, nom, prénoms, sexe, date et lieu de naissance, CIN, téléphone, adresse, filière, année d'entrée, niveau 2026-2027, redoublant, droits en 1/2/3 fois).
  - Feuille **Paiements** : une ligne par paiement déjà reçu en 2026-2027 (N° étudiant, date, montant, mode, opérateur, référence, n° de reçu papier).
- **Fichiers acceptés** : le `.xlsx` du modèle (recommandé), ou deux CSV (`etudiants.csv`, `paiements.csv`, UTF-8, séparateur `;`). Lecture xlsx : librairie à choisir (`write-excel-file` n'écrit que).
- **Parcours** : 1. Télécharger le modèle ; 2. Déposer le fichier ; 3. **Rapport sans rien écrire** (lignes acceptées, refusées avec la raison et le n° de ligne, doublons déjà en base, totaux) ; 4. « Importer n étudiants et n paiements », une seule confirmation ; 5. Résumé (matricules attribués).
- **Règles** :
  - une seule transaction ; un fichier avec une erreur bloquante n'importe rien ;
  - matricule attribué par année d'entrée puis dans l'ordre des N°, via le `Compteur` ;
  - inscription sur l'année courante au niveau indiqué, échéances générées d'après les tarifs (import refusé si un tarif manque) ;
  - paiements répartis comme au guichet (le plus ancien d'abord), refusés au-delà du reste dû ; n° de reçu papier gardé en observation ;
  - relançable sans doublons : étudiant reconnu par nom, prénoms et date de naissance ;
  - pas d'annulation d'un import (un paiement ne se supprime pas) : le rapport préalable sert à éviter les erreurs ; un paiement importé à tort s'annule comme les autres.
- **Points ouverts** : numéro des reçus de reprise (`R-2026-…` ou numérotation propre) ; impayés des années antérieures à reprendre ou non (il faudrait alors leurs inscriptions et leurs tarifs) ; colonnes à ajuster une fois le fichier Excel actuel de l'institut vu.

### Phase 8 — Déploiement cPanel
- [x] Node 22.23.4 dans « Setup Node.js App » (28/10/2026). PostgreSQL du serveur : **10** ; code rendu compatible (`hashtext`), suite testée avec `pnpm test:docker vitest --postgres 10`
- [x] Base `ifspamg_app`, utilisateur `ifspamg_web` (28/10/2026)
- [x] `output: "standalone"` ; build fait **sous Linux** dans Docker : `docker/prod/Dockerfile`, archive `dist/production/ifspa-production.zip`
  - ⚠️ **Variables `NEXT_PUBLIC_*` figées au build** : Next.js les inscrit dans le code au moment de `pnpm build`. Elles doivent donc être dans le `.env` du PC de dev **avec leurs valeurs de production** avant le build (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_APP_URL` avec le vrai domaine). Les définir seulement dans cPanel ne sert à rien ; en changer une impose de refaire le build et de le renvoyer.
  - Les autres variables (secrètes ou non) sont lues au démarrage du serveur : elles se mettent dans « Setup Node.js App » (voir plus bas), jamais dans le build envoyé.
- [x] Envoi sans SSH (port fermé chez GasyWeb, ticket à ouvrir) : archive découpée en morceaux de 9 Mo, déposés par le gestionnaire de fichiers, recollés et décompressés (`unzip`) dans `~/ifspa-app` via le Terminal cPanel
- [x] « Setup Node.js App » : `ifspa-app`, `server.js`, mode Production ; secrets dans `~/ifspa-app/.env.production` (chmod 600), lu par Next au démarrage. **Reste : `SMTP2GO_API_KEY`, `EMAIL_EXPEDITEUR`, `CONTACT_DESTINATAIRE`** (absents du .env de dev)
- [x] Base initiale (migrations + admin + filières, sans année : `SEED_SANS_ANNEE=1`) construite sur un PostgreSQL 10 local puis importée par `psql` dans le Terminal cPanel
- [ ] HTTPS via AutoSSL ; sauvegardes via les outils de cPanel. **HTTPS obligatoire pour l'encaissement hors ligne** : le service worker n'existe qu'en contexte sécurisé, un poste ouvert en `http://` n'aura jamais le hors ligne.
- [ ] Postes du guichet : ouvrir `/app/encaisser` en ligne une première fois après chaque déploiement, et mettre un marque-page sur `/app/encaisser` (après une coupure de courant sans Internet, `/` et `/connexion` ne s'ouvrent pas).
- [x] Une seule adresse `https://ifspa.mg` : « Forcer HTTPS » refusé par cPanel (AutoSSL inactif, certificat Let's Encrypt), donc redirection 301 http et www en tête de `public_html/.htaccess` (sauvegarde `.htaccess.avant-redirection`), `/.well-known/` exclu
- [x] Contrôler en ligne : `https://<domaine>/robots.txt` et `/sitemap.xml` répondent et contiennent le vrai domaine (pas `localhost` : sinon `NEXT_PUBLIC_APP_URL` manquait au build) ; le code source de la page d'accueil porte la bonne URL canonique.
- [x] En-têtes de sécurité (`Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`) dans `next.config.ts` (`headers()`), vérifiés en ligne.

### Phase 9 — Référencement Google (après la mise en ligne)
Le site n'apparaît pas tout seul ni tout de suite : il faut le déclarer à Google, puis compter **quelques jours à quelques semaines** pour l'indexation. Rien n'est à payer. Le code est déjà prêt (titre, description, canonique, Open Graph, `robots.txt`, `sitemap.xml`, données structurées, `noindex` sur `/connexion` et `/app`).

**Prérequis** : phase 8 terminée (vrai domaine en HTTPS) et vraies coordonnées saisies (adresse, téléphone, e-mail) : tant qu'il reste des « À compléter » sur la page, attendre.

- [ ] **Google Search Console** (https://search.google.com/search-console, gratuit, compte Google de l'institut de préférence, Diano ajouté comme utilisateur) :
  - ajouter une propriété de type **Domaine** et la valider par un enregistrement **TXT** : cPanel > **Zone Editor** > « + Ajouter un enregistrement » > TXT, coller la valeur donnée par Google. Si les DNS ne sont pas gérés dans ce cPanel (registrar ou Cloudflare), ajouter le TXT là où ils le sont. Validation : de quelques minutes à 48 h ;
  - à défaut, propriété **Préfixe d'URL** validée par un fichier HTML fourni par Google, déposé dans `public/` (puis build et envoi) ;
  - **Sitemaps** > soumettre `https://<domaine>/sitemap.xml` ;
  - **Inspection de l'URL** > page d'accueil > « Demander l'indexation ».
- [ ] **Fiche Google Business Profile** (https://business.google.com, gratuit) : c'est elle qui fait apparaître l'institut sur Google Maps et dans les recherches locales (« école infirmière Toamasina »). Catégorie « Établissement d'enseignement supérieur » ou proche, adresse, horaires, téléphone, photos, **lien vers le site**. Google vérifie que l'institut existe (appel, SMS, vidéo ou courrier postal à l'adresse) : à faire **avec l'institut**, qui doit être propriétaire de la fiche.
- [ ] **Bing Webmaster Tools** (facultatif, gratuit) : importer la propriété depuis Search Console en un clic.
- [ ] **Liens vers le site** : l'ajouter sur la page Facebook de l'institut, et demander un lien aux partenaires (hôpitaux de stage, ministère, annuaires d'établissements). Chaque lien sérieux aide le référencement.
- [ ] **Image d'aperçu des partages** (Open Graph, 1200 × 630) avec une vraie photo de l'institut, dès qu'elle est fournie.
- [ ] **Contrôle à J+7 puis J+30** : rechercher `site:<domaine>` sur Google ; dans Search Console, rapports « Pages » (indexée ? pourquoi exclue ?) et « Signaux Web essentiels » ; corriger ce qui est signalé.
- Pas de promesse de classement : Google décide. Ce qui le fait progresser ensuite, c'est le contenu réel (présentation, filières, conditions d'admission), la fiche Google à jour et les liens depuis d'autres sites.

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
  - répartition d'un paiement : plusieurs mois d'un coup, paiement partiel (acompte sur l'échéance suivante, échéance payée en partie, tranche de droits payée en partie), paiement couvrant des échéances de deux années, refus du trop-perçu au-delà du reste dû total ;
  - calcul des retards à une date donnée (dernier jour du mois M : à venir ; 1er du mois M+1 : en retard) ;
  - montant en lettres ;
  - admission puis annulation, qui doit restaurer exactement l'état d'avant.
- **Parcours manuel** :
  1. Se connecter en admin et créer une année et des tarifs.
  2. Créer 3 étudiants et vérifier les matricules `IF-2026-0001`, `IF-2026-0002` et `SF-2026-0001` (la séquence est propre à chaque filière).
  3. Encaisser deux mois et vérifier la grille. Encaisser un mois avec un surplus (100 000 Ar pour 80 000 Ar) et vérifier l'acompte sur le mois suivant. Imprimer le reçu : vérifier le logo, le montant en lettres et le reste à payer. Couper Internet, encaisser, rétablir, puis vérifier la synchronisation. Imprimer le relevé d'écolage.
  4. Lancer une admission avec 2 admis et 1 redoublant, puis l'annuler et vérifier que l'état est restauré.
  5. Se connecter en USER et vérifier qu'aucun bouton de suppression ou d'annulation n'apparaît, et que l'appel direct à la Server Action est refusé.
- `npm run build` et `npm run lint` sans erreur avant chaque fin de phase.
