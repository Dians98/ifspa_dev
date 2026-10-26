# Rapport de recette du 25/10/2026 : parcours A-Z

Mission exceptionnelle : un fil continu de bout en bout (9 actes, 53 étapes, 5 étudiants), rejouable à la main par Diano. Guide : [PARCOURS-A-Z.md](../PARCOURS-A-Z.md). Captures : `recette/scenarios/parcours-a-z/captures/` (56, toutes lues). Parcours : `recette/parcours/AZ-1-…` à `AZ-9-…` (+ `aides-az.ts`).

## Résultat

- **53 étapes sur 53 ✅**, 9 actes, 14 tests Playwright (16 avec les 2 connexions), un seul `pnpm recette:parcours AZ- --project ordinateur` : 16 passés en 48 s, dans l'ordre, de la base vidée par `parcours:vider` jusqu'à la clôture.
- **0 ❌, 0 « non démontré »** dans le fil. Mobile non déroulé (hors mission).
- Rejeu de **UC06-08** après le changement « le double sort toujours » : ✅ 5 étapes sur 5 (voir « Changement du double »).

| Acte | Étapes | Résultat |
|---|---|---|
| 1. Paramétrage 2025-2026 | 6 | ✅ |
| 2. Inscriptions (4 étudiants) | 6 | ✅ |
| 3. Guichet | 8 | ✅ (dont le trop-perçu refusé, 3.6) |
| 4. Contrôle | 7 | ✅ (dont le secrétariat sans bouton Annuler, 4.1) |
| 5. Abandon | 5 | ✅ |
| 6. Nouvelle année et passage | 8 | ✅ |
| 7. Rentrée 2026-2027 | 4 | ✅ |
| 8. Encaisser sans Internet | 5 | ✅ |
| 9. Fin | 4 | ✅ |

## Build testé

`git log -1` : `6be7b33 offline`. `git status --short` : **code non commité compris** : `docs/PLAN.md`, `src/components/recu/imprimer-ticket.tsx`, `src/components/recu/options-ticket.tsx` (le double toujours imprimé), `e2e/app/encaisser.spec.ts`, `package.json`, `playwright.config.ts`, `scripts/parcours.ts`, `scripts/tests-docker.ts`. `pnpm build` ✅ (refait après le changement du double, avant le rejeu). Base `ifspa_recette` vidée par `pnpm parcours:vider --confirmer --base ifspa_recette`, application sur le port 3200. Rien n'a été lancé sur la base de dev ni sur le port 3100.

## Chiffres obtenus (tels que le guide les annonce)

| Moment | Obtenu |
|---|---|
| Matricules | IF-2025-0001 (A), IF-2025-0002 (B), SF-2025-0001 (C), IF-2025-0003 (D), IF-2026-0001 (E) |
| Reçus | R-2026-00021 (A, 900 000 Ar), 00022 (B, 300 000 Ar, MVola), 00023 (D, 100 000 Ar), 00024 (D, 60 000 Ar, annulé), 00025 (B, 100 000 Ar), 00001 (E, hors ligne) |
| Acte 4, Paiements | 4 reçus, 1 360 000 Ar (1 060 000 espèces, 300 000 Mobile Money) ; après annulation 3 + 1 annulé, 1 300 000 Ar |
| Acte 4, Impayés | 3 étudiants, 2 420 000 Ar (C 1 020 000, D 800 000, B 600 000 sur 8 mois) |
| Acte 4, tableau de bord | effectif 4, 34,9 % (1 300 000 sur 3 720 000), 3 sur 4 en retard |
| Acte 5, C | abandon au 15/12/2025 : reste 390 000 Ar, 7 échéances « Non due (sortie) », Impayés : 2 étudiants, 1 400 000 Ar |
| Acte 6, passage | A et B en 2e année (960 000 Ar chacun pour 2026-2027), D redouble (reste 1 700 000 Ar) |
| Acte 7, B | 1 560 000 Ar au guichet ; 100 000 Ar : décembre 2025 soldé, 60 000 Ar d'acompte sur janvier ; reste 1 460 000 Ar |
| Acte 9, 2025-2026 | effectif 3, 45,3 % (1 400 000 sur 3 090 000), 2 sur 3 en retard ; 2026-2027 : « Rien n'est encore échu » |

## Adaptations faites au fil (par rapport au fil proposé)

1. **Pas de tarif invalide** (consigne de Diano). Refus gardés : trop-perçu (3.6) et secrétariat sans bouton Annuler (4.1).
2. **Acte 3** : B paie **300 000 Ar** : trois tranches de droits, octobre et novembre soldés, 40 000 Ar d'acompte sur décembre. L'ordre de répartition mêle les tranches et les mensualités par date (tranche 1/3, octobre, tranche 2/3, novembre, tranche 3/3, décembre).
3. **Acte 5, C** : l'abandon est enregistré avec la **date du 15/12/2025** (sortie antidatée permise, décision 33). Avec la date du jour, l'abandon ne retirerait aucune échéance de 2025-2026 et le « ce que ça change » serait invisible. Conséquence : reste 390 000 Ar, sortie de la liste des Impayés, encaissable au guichet (décision 20).
4. **Acte 6** : tarifs 2026-2027 pour **IF seulement** (1re année pour D qui redouble, 2e année pour A et B). SF n'est pas nécessaire : la classe SF 1re année est vide (C est sortie, « Aucun étudiant »). 2e année à 110 000 / 85 000 Ar pour qu'on voie le tarif copié (960 000 Ar). L'année 2026-2027 reste « en préparation » jusqu'au passage, puis l'administrateur la rend courante (6.8) : le passage se fait avec 2025-2026 courante.
5. **Annulation d'un passage bloquée par un paiement** : non insérée. Aucun paiement n'existe sur les inscriptions créées par le passage (B paie 2025-2026 d'abord) ; tenter l'annulation la réussirait et défairait l'acte 6. Couvert par [UC10-06](../scenarios/UC10-passage/UC10-06-annulation-bloquee-paiement.md).
6. **Acte 8** : sur E (IF-2026-0001) et ses droits (100 000 Ar). Le parcours utilise `context.setOffline` sur le build du port 3200, avec le **même poste** (état du navigateur conservé d'un acte à l'autre, IndexedDB comprise) que les actes 3, 5 et 7, comme le fera Diano dans sa fenêtre normale. Pour Diano : `pnpm dev` ne convient pas, il faut `pnpm build` puis `pnpm start`.
7. **Acte 9, clôture** : possible (2025-2026 n'est plus courante). Elle laisse les impayés encaissables.
8. Numéros de reçu : les 20 premiers sont réservés au poste dès l'ouverture d'Encaisser (comme déjà noté en UC06), d'où R-2026-00021 pour le premier reçu en ligne et R-2026-00001 pour le reçu hors ligne. Pour que les numéros du guide soient ceux de Diano, les parcours des actes 3, 5.5, 7 et 8 réutilisent le même navigateur ; dans le guide : une fenêtre normale pour le secrétariat, une fenêtre privée pour l'administrateur.
9. Vérifié sans le dire au guide : un navigateur qui garde l'ancien poste après `parcours:vider` (on oublie de vider les données du site) obtient quand même R-2026-00021 sans conflit ni message d'erreur. Le conseil de vider les données du site reste valable.

## Changement du double

Le ticket s'imprime maintenant toujours avec son double « DOUBLE » ; la case « Imprimer aussi un double pour l'institut » a disparu.

- Le build a été refait avant les parcours, et le guide l'écrit (3.3, 8.3).
- `recette/parcours/UC06-08-ticket-80-58-double.recette.ts` : étape 1 attend maintenant 2 tickets 80 mm (reçu puis « DOUBLE »), étape 2 vérifie qu'il n'y a plus de case, étape 5 ne décoche plus rien. Nouvelle capture `UC06-08-01-ticket-80mm-double.png`. Scénario [UC06-08](../scenarios/UC06-encaisser/UC06-08-ticket-80-58-double.md) mis à jour. Rejoué sur base fraîche (préparation 00, 00b, puis UC06-01 à 08) : ✅ 8 cas, reçus R-2026-00052 et 00053 inchangés.
- **L'aide commune `ticketImprime` (`recette/parcours/aides.ts`) a dû être adaptée** : son sélecteur `^Reçu R-…` trouvait deux tickets (violation du mode strict) et faisait échouer six cas UC06 avant correction. Il vise maintenant le ticket seul (`^Reçu R-… (, annulé)?$`).

## Corrections à faire

| # | Cas et étape | Attendu | Obtenu | Gravité | Cause probable | Relais |
|---|---|---|---|---|---|---|
| 1 | Acte 8, 8.4 ([capture](../scenarios/parcours-a-z/captures/AZ-8-4-synchronise.png)) | Après la synchronisation, le message du ticket ne promet plus un envoi futur | Le bandeau dit « En ligne · tout est synchronisé » et « 1 paiement envoyé au serveur », mais le message vert du ticket garde « Ticket R-2026-00001 remis. Paiement gardé sur ce poste, il sera envoyé à la prochaine synchronisation. » | mineur | Le message de succès hors ligne n'est pas mis à jour quand la file se vide | `frontend-builder` |
| 2 | Parcours existants UC07-06, UC13-01, UC13-03, UC13-05, UC15-01 | Ces parcours passent encore | Ils cherchent `getByRole("article", { name: /^Reçu R-…/ })` sans restreindre : deux tickets (reçu et double) font échouer l'assertion. **Non rejoués** (ils demandent leurs préparations propres) ; leurs scénarios disent peut-être « un seul ticket » | gênant (recette périmée, pas l'application) | Changement du double | agent principal : à passer à `tester-fonctionnel` pour UC07, UC13 et UC15 (à adapter comme UC06-08 et `ticketImprime`) |
| 3 | Outillage : `connexion.setup.ts` | Deux commandes `pnpm recette:parcours` à quelques secondes d'écart passent | La seconde connexion échoue (« Trop de tentatives, réessayez dans quelques secondes. », test de connexion du secrétariat en timeout) : le limiteur de tentatives de connexion est atteint. Contourné par des pauses de 10 à 15 s entre les commandes | mineur | Chaque commande se connecte deux fois ; limiteur Better Auth (UC01-09) | agent principal (ajouter une consigne ou réutiliser la session valide si elle existe) |
| 4 | Journal du serveur de recette | Pas d'erreur serveur | Pendant l'acte 2, des lignes `⨯ Error: The destination stream closed early.` (digest 292668148) apparaissent dans la sortie du serveur ; aucune conséquence visible dans le parcours | mineur, non investigué | Probablement une réponse en flux interrompue quand le navigateur quitte la page pendant la capture ou une redirection | `backend-builder` (à regarder si cela se reproduit sur le dev de Diano) |

## Questions

1. **Numéros de reçu qui démarrent à 00021** (20 numéros réservés dès l'ouverture d'Encaisser, « Numéros non utilisés (20) » visible de l'administrateur dès le premier reçu) : comportement voulu, déjà posé en UC06. Le guide l'explique à Diano ; à confirmer que cela ne le surprendra pas devant le client.
2. **Acte 6 : le passage se fait avec 2025-2026 encore courante**, puis l'administrateur change d'année. Est-ce l'ordre naturel à l'institut ? L'autre ordre (changer d'année avant le passage) n'a pas été essayé ; l'ordre du guide est celui qui a été vu.
3. **Fiche de C après l'abandon** : le bouton principal reste « Encaisser 390 000 Ar » : cohérent avec la décision provisoire n° 20, à confirmer.
4. **Acte 4** : le tableau de bord de 2025-2026 compte les 390 000 Ar dus par C dans l'« attendu à date » mais C n'est pas dans l'effectif (3) : cohérent avec la décision 28 (« l'argent des abandons reste compté dans le taux »), mais l'écart entre 3 étudiants et 3 090 000 Ar attendus peut étonner.

## À faire par Diano

- Rejouer le guide sur sa base de dev : `pnpm parcours:vider --confirmer`, vider les données du site dans le navigateur, une fenêtre normale (secrétariat) et une fenêtre privée (administrateur).
- **Acte 8 en vrai** : couper réellement Internet (mode avion ou Wi-Fi) sur `pnpm build` puis `pnpm start` ; l'automate ne fait que `setOffline`.
- **Impression réelle** : les deux tickets (reçu puis « DOUBLE ») sur l'imprimante thermique 80 mm, et en 58 mm ; contraste du logo et coupe.
- Relevé PDF (4.6) : le regarder à l'écran et sur papier A4.
- Après le 1er novembre 2026 : lire l'encadré du guide (octobre 2026 passe en retard).

## Ce qui n'a pas été fait

- Aucune commande git qui écrit. Aucun fichier touché hors de `recette/`.
- Parcours mobile : non déroulé.
- Les autres UC (UC07, UC13, UC15) n'ont pas été rejoués après le changement du double (voir correction n° 2).
