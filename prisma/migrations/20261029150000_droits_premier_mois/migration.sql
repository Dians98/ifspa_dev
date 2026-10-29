UPDATE "echeance" ec
SET "mois" = make_date(a."anneeDebut", a."moisDebutEcolage", 1)
FROM "inscription" i
JOIN "annee_scolaire" a ON a.id = i."anneeScolaireId"
WHERE i.id = ec."inscriptionId" AND ec."type" = 'DROITS';
