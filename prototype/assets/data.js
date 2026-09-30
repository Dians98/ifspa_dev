/* Prototype IFSPA — données FICTIVES, partagées par toutes les pages.
   Date du jour simulée : 12 mars 2027 (année scolaire 2026-2027, en cours). */
(function () {
  const AUJOURDHUI = new Date("2027-03-12");
  const ANNEE = { libelle: "2026-2027", debut: 2026 };
  const TARIF = { droits: 100000, mensuel: 80000, nombreMois: 10 }; // identique pour toutes les filières et niveaux (exemple)
  const MOIS = ["oct.", "nov.", "déc.", "janv.", "févr.", "mars", "avr.", "mai", "juin", "juil."];
  const MOIS_LONGS = ["octobre 2026", "novembre 2026", "décembre 2026", "janvier 2027", "février 2027", "mars 2027", "avril 2027", "mai 2027", "juin 2027", "juillet 2027"];

  const FILIERES = {
    IF: { code: "IF", nom: "Infirmier(e)s", duree: 3 },
    SF: { code: "SF", nom: "Sage-femmes", duree: 3 },
  };

  const UTILISATEURS = [
    { id: "u1", nom: "Administrateur IFSPA", email: "admin@ifspa.mg", role: "admin", actif: true, derniere: "12/03/2027 08:14" },
    { id: "u2", nom: "Hanitra RAKOTO", email: "secretariat@ifspa.mg", role: "secretariat", actif: true, derniere: "12/03/2027 09:02" },
    { id: "u3", nom: "Njaka RANDRIA", email: "caisse2@ifspa.mg", role: "secretariat", actif: false, derniere: "18/11/2026 16:40" },
  ];

  // p = paiements : [date, montant, mode, référence Mobile Money, caissier, annulé ?]
  const ETUDIANTS = [
    { id: 1, matricule: "IF-2026-0001", nom: "RAKOTOMALALA", prenoms: "Hanta Fitiavana", sexe: "F", photo: 9, filiere: "IF", niveau: 1, entree: 2026, statut: "ACTIF", naissance: "14/05/2006", lieu: "Toamasina", tel: "034 12 345 67", tuteur: "RAKOTOMALALA Jean", telTuteur: "032 45 678 90", adresse: "Lot II A 45, Ambodimanga, Toamasina",
      p: [["2026-10-04", 180000, "ESPECES"], ["2026-12-02", 160000, "MVOLA", "MP261202.1532.A41"], ["2027-02-03", 160000, "ESPECES"], ["2027-03-05", 80000, "ESPECES"]] },
    { id: 2, matricule: "IF-2026-0002", nom: "RANDRIAMAMPIONONA", prenoms: "Tojo", sexe: "M", photo: 2, filiere: "IF", niveau: 1, entree: 2026, statut: "ACTIF", naissance: "02/09/2005", lieu: "Brickaville", tel: "033 21 456 78", tuteur: "RANDRIAMAMPIONONA Hery", telTuteur: "034 98 765 43", adresse: "Bazar Be, Toamasina",
      p: [["2026-10-06", 180000, "ESPECES"], ["2026-12-10", 160000, "ORANGE_MONEY", "CI261210.0845.B12"], ["2027-01-14", 80000, "ESPECES", null, "Hanitra RAKOTO", "Doublon de saisie"], ["2027-01-15", 80000, "ESPECES"]] },
    { id: 3, matricule: "SF-2026-0001", nom: "RAZAFINDRAKOTO", prenoms: "Miora", sexe: "F", photo: 3, filiere: "SF", niveau: 1, entree: 2026, statut: "ACTIF", naissance: "21/01/2006", lieu: "Fénérive-Est", tel: "034 55 102 33", tuteur: "RAZAFINDRAKOTO Lanto", telTuteur: "032 11 222 33", adresse: "Tanambao V, Toamasina",
      p: [["2026-10-02", 340000, "MVOLA", "MP261002.1011.C07"], ["2027-01-08", 240000, "ESPECES"]] },
    { id: 4, matricule: "SF-2026-0002", nom: "RASOANAIVO", prenoms: "Lalaina", sexe: "F", photo: 11, filiere: "SF", niveau: 1, entree: 2026, statut: "ACTIF", naissance: "30/07/2005", lieu: "Vatomandry", tel: "032 67 890 12", tuteur: "RASOANAIVO Solange", telTuteur: "034 20 304 05", adresse: "Ankirihiry, Toamasina",
      p: [["2026-10-09", 100000, "ESPECES"], ["2026-11-20", 160000, "AIRTEL_MONEY", "AM261120.1402.D55"]] },
    { id: 5, matricule: "IF-2025-0003", nom: "ANDRIANAIVO", prenoms: "Sitraka", sexe: "M", photo: 5, filiere: "IF", niveau: 2, entree: 2025, statut: "ACTIF", naissance: "11/11/2004", lieu: "Toamasina", tel: "034 77 889 90", tuteur: "ANDRIANAIVO Paul", telTuteur: "033 44 556 67", adresse: "Morarano, Toamasina",
      p: [["2026-10-05", 180000, "ESPECES"], ["2026-12-01", 160000, "ESPECES"], ["2027-02-02", 160000, "MVOLA", "MP270202.0930.E18"], ["2027-03-08", 40000, "ESPECES"]] },
    { id: 6, matricule: "IF-2025-0007", nom: "RAHARISON", prenoms: "Mialy", sexe: "F", photo: 6, filiere: "IF", niveau: 2, entree: 2025, statut: "ACTIF", naissance: "05/03/2005", lieu: "Mahanoro", tel: "032 90 123 45", tuteur: "RAHARISON Voninavoko", telTuteur: "034 60 708 09", adresse: "Salazamay, Toamasina",
      p: [["2026-10-03", 900000, "MVOLA", "MP261003.1120.F02"]] },
    { id: 7, matricule: "SF-2025-0002", nom: "RAVELOJAONA", prenoms: "Nirina", sexe: "F", photo: 8, filiere: "SF", niveau: 2, entree: 2025, statut: "ACTIF", naissance: "17/12/2004", lieu: "Toamasina", tel: "034 31 415 92", tuteur: "RAVELOJAONA Marc", telTuteur: "032 65 358 97", adresse: "Ambolomadinika, Toamasina",
      p: [["2026-10-07", 180000, "ESPECES"], ["2026-11-30", 160000, "ORANGE_MONEY", "CI261130.1705.G66"]] },
    { id: 8, matricule: "SF-2025-0005", nom: "RAJAONARISON", prenoms: "Voahangy", sexe: "F", photo: 7, filiere: "SF", niveau: 1, redoublant: true, entree: 2025, statut: "ACTIF", naissance: "08/08/2004", lieu: "Foulpointe", tel: "033 12 131 41", tuteur: "RAJAONARISON Fara", telTuteur: "034 51 617 18", adresse: "Mangarivotra, Toamasina",
      p: [["2026-10-12", 180000, "ESPECES"], ["2027-01-20", 320000, "MVOLA", "MP270120.1348.H90"]] },
    { id: 9, matricule: "IF-2024-0004", nom: "RANDRIANASOLO", prenoms: "Haja", sexe: "M", photo: 10, filiere: "IF", niveau: 3, entree: 2024, statut: "ACTIF", naissance: "25/06/2003", lieu: "Toamasina", tel: "034 99 887 76", tuteur: "RANDRIANASOLO Rivo", telTuteur: "032 12 998 87", adresse: "Ampasimazava, Toamasina",
      p: [["2026-10-01", 180000, "ESPECES"], ["2026-12-18", 240000, "MVOLA", "MP261218.1015.J33"], ["2027-03-02", 160000, "ESPECES"]] },
    { id: 10, matricule: "IF-2024-0009", nom: "RAKOTONDRABE", prenoms: "Faniry", sexe: "F", photo: 12, filiere: "IF", niveau: 3, entree: 2024, statut: "ACTIF", naissance: "13/02/2004", lieu: "Ambatondrazaka", tel: "032 40 506 07", tuteur: "RAKOTONDRABE Noëline", telTuteur: "034 30 405 06", adresse: "Tanambao II, Toamasina",
      p: [["2026-10-15", 180000, "ESPECES"]] },
    { id: 11, matricule: "SF-2024-0001", nom: "RAMANANTSOA", prenoms: "Tiana", sexe: "F", photo: 1, filiere: "SF", niveau: 3, entree: 2024, statut: "ACTIF", naissance: "19/10/2003", lieu: "Toamasina", tel: "034 18 273 64", tuteur: "RAMANANTSOA Luc", telTuteur: "033 91 827 36", adresse: "Ampasimbe, Toamasina",
      p: [["2026-10-02", 340000, "ESPECES"], ["2027-01-06", 240000, "MVOLA", "MP270106.0812.K21"]] },
    { id: 12, matricule: "IF-2023-0006", nom: "RABEMANANJARA", prenoms: "Fenitra", sexe: "M", photo: 4, filiere: "IF", niveau: 3, entree: 2023, statut: "DIPLOME", sortie: "31/07/2026", naissance: "03/04/2002", lieu: "Toamasina", tel: "034 62 738 49", tuteur: "RABEMANANJARA Solo", telTuteur: "032 83 746 51", adresse: "Anjoma, Toamasina",
      p: [] },
  ];

  // ── Numérotation des reçus : R-{année civile}-{séquence}, dans l'ordre chronologique ──
  const PAIEMENTS = [];
  ETUDIANTS.forEach((e) => (e.p || []).forEach(([date, montant, mode, ref, caissier, motif]) => {
    PAIEMENTS.push({ etudiant: e, date, montant, mode, reference: ref || null, caissier: caissier || (date < "2026-11-18" && e.id % 2 === 0 ? "Njaka RANDRIA" : "Hanitra RAKOTO"), annule: !!motif, motifAnnulation: motif || null });
  }));
  PAIEMENTS.sort((a, b) => a.date.localeCompare(b.date));
  const compteurs = { 2026: 40, 2027: 12 }; // séquences fictives déjà entamées
  PAIEMENTS.forEach((p) => { const an = p.date.slice(0, 4); compteurs[an]++; p.recu = `R-${an}-${String(compteurs[an]).padStart(5, "0")}`; });
  const annulation = PAIEMENTS.find((p) => p.annule);
  if (annulation) { annulation.annulePar = "Administrateur IFSPA"; annulation.dateAnnulation = "14/01/2027 15:20"; }

  // ── Calculs ──
  const nbsp = " ";
  function ar(n) { return Math.round(n).toLocaleString("fr-FR").replace(/\s/g, nbsp) + nbsp + "Ar"; }
  function dateFr(iso) { const [a, m, j] = iso.split("-"); return `${j}/${m}/${a}`; }
  function moisEchus() { // mensualités exigibles au 12/03/2027 : oct. → mars = 6
    return 6;
  }
  function totalPaye(e) { return (e.p || []).filter((x) => !x[5]).reduce((s, x) => s + x[1], 0); }

  /** Échéancier de l'année en cours, paiements répartis des plus anciennes échéances aux plus récentes. */
  function echeancier(e) {
    let reste = totalPaye(e);
    const lignes = [];
    const pd = Math.min(reste, TARIF.droits); reste -= pd;
    lignes.push({ libelle: "Droits d'inscription", court: "Droits", du: TARIF.droits, paye: pd, echue: true });
    MOIS.forEach((m, i) => {
      const paye = Math.min(reste, TARIF.mensuel); reste -= paye;
      lignes.push({ libelle: "Mensualité " + MOIS_LONGS[i], court: m, du: TARIF.mensuel, paye, echue: i < moisEchus() });
    });
    lignes.forEach((l) => {
      l.statut = l.paye >= l.du ? "paye" : l.paye > 0 ? "partiel" : l.echue ? "retard" : "avenir";
      if (l.statut === "partiel" && !l.echue) l.statut = "partiel";
    });
    return lignes;
  }
  function situation(e) {
    if (e.statut !== "ACTIF") return { du: 0, paye: 0, reste: 0, retard: 0, moisRetard: 0, statut: "solde" };
    const l = echeancier(e);
    const echu = l.filter((x) => x.echue);
    const duEchu = echu.reduce((s, x) => s + x.du, 0);
    const payeEchu = echu.reduce((s, x) => s + Math.min(x.paye, x.du), 0);
    const retard = duEchu - payeEchu;
    const moisRetard = echu.filter((x) => x.statut !== "paye" && x.court !== "Droits").length;
    const totalAnnee = l.reduce((s, x) => s + x.du, 0);
    const paye = totalPaye(e);
    return { duEchu, payeEchu, retard, moisRetard, totalAnnee, paye, resteAnnee: totalAnnee - paye, statut: retard === 0 ? "ajour" : moisRetard >= 2 ? "retard" : "partiel" };
  }

  function photo(e) { return `assets/photos/etudiant-${String(e.photo).padStart(2, "0")}.webp`; }
  function nomComplet(e) { return `${e.nom} ${e.prenoms}`; }
  function niveau(n) { return n === 1 ? "1re année" : `${n}e année`; }
  function modeLibelle(m) { return { ESPECES: "Espèces", MVOLA: "MVola", ORANGE_MONEY: "Orange Money", AIRTEL_MONEY: "Airtel Money" }[m] || m; }

  // Chiffres globaux fictifs de l'établissement (184 étudiants actifs)
  const GLOBAL = {
    effectif: 184, effectifIF: 112, effectifSF: 72,
    attendu: 106720000, encaisse: 91480000,
    moisCourant: 7840000, moisPrecedent: 9120000, enRetard: 37,
    parNiveau: [
      { f: "IF", n: 1, eff: 42, attendu: 24360000, encaisse: 21040000, retard: 8 },
      { f: "IF", n: 2, eff: 38, attendu: 22040000, encaisse: 19180000, retard: 7 },
      { f: "IF", n: 3, eff: 32, attendu: 18560000, encaisse: 15020000, retard: 9 },
      { f: "SF", n: 1, eff: 27, attendu: 15660000, encaisse: 13470000, retard: 5 },
      { f: "SF", n: 2, eff: 24, attendu: 13920000, encaisse: 11830000, retard: 5 },
      { f: "SF", n: 3, eff: 21, attendu: 12180000, encaisse: 10940000, retard: 3 },
    ],
  };

  window.IFSPA = { AUJOURDHUI, ANNEE, TARIF, MOIS, MOIS_LONGS, FILIERES, UTILISATEURS, ETUDIANTS, PAIEMENTS, GLOBAL,
    ar, dateFr, totalPaye, echeancier, situation, photo, nomComplet, niveau, modeLibelle,
    etudiant: (id) => ETUDIANTS.find((e) => e.id === Number(id)) };
})();
