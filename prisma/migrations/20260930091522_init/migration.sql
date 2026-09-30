-- CreateEnum
CREATE TYPE "Sexe" AS ENUM ('M', 'F');

-- CreateEnum
CREATE TYPE "StatutEtudiant" AS ENUM ('ACTIF', 'DIPLOME', 'ABANDON', 'EXCLU');

-- CreateEnum
CREATE TYPE "StatutInscription" AS ENUM ('EN_COURS', 'ADMIS', 'REDOUBLE', 'DIPLOME', 'ABANDON', 'EXCLU');

-- CreateEnum
CREATE TYPE "TypeEcheance" AS ENUM ('DROITS', 'MENSUALITE');

-- CreateEnum
CREATE TYPE "ModePaiement" AS ENUM ('ESPECES', 'MOBILE_MONEY');

-- CreateEnum
CREATE TYPE "OperateurMobile" AS ENUM ('MVOLA', 'ORANGE_MONEY', 'AIRTEL_MONEY');

-- CreateEnum
CREATE TYPE "DecisionAdmission" AS ENUM ('ADMIS', 'REDOUBLANT', 'DIPLOME');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" TEXT DEFAULT 'user',
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etablissement" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "nom" TEXT NOT NULL DEFAULT 'Institut de Formation Supérieur des Paramédicaux Atsinanana',
    "sigle" TEXT NOT NULL DEFAULT 'IFSPA',
    "adresse" TEXT,
    "ville" TEXT NOT NULL DEFAULT 'Toamasina',
    "telephone" TEXT,
    "email" TEXT,
    "nif" TEXT,
    "stat" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "etablissement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filiere" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "dureeAnnees" INTEGER NOT NULL DEFAULT 3,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "filiere_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annee_scolaire" (
    "id" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "anneeDebut" INTEGER NOT NULL,
    "dateDebut" DATE NOT NULL,
    "dateFin" DATE NOT NULL,
    "moisDebutEcolage" INTEGER NOT NULL DEFAULT 10,
    "estCourante" BOOLEAN NOT NULL DEFAULT false,
    "cloturee" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "annee_scolaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarif" (
    "id" TEXT NOT NULL,
    "filiereId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "niveau" INTEGER NOT NULL,
    "droitsInscription" INTEGER NOT NULL,
    "montantMensuel" INTEGER NOT NULL,
    "nombreMois" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarif_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etudiant" (
    "id" TEXT NOT NULL,
    "matricule" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenoms" TEXT NOT NULL,
    "sexe" "Sexe" NOT NULL,
    "dateNaissance" DATE NOT NULL,
    "lieuNaissance" TEXT NOT NULL,
    "cin" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "adresse" TEXT,
    "tuteurNom" TEXT,
    "tuteurTelephone" TEXT,
    "photo" TEXT,
    "filiereId" TEXT NOT NULL,
    "anneeEntreeId" TEXT NOT NULL,
    "statut" "StatutEtudiant" NOT NULL DEFAULT 'ACTIF',
    "dateSortie" DATE,
    "motifSortie" TEXT,
    "creeParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "etudiant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inscription" (
    "id" TEXT NOT NULL,
    "etudiantId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "niveau" INTEGER NOT NULL,
    "redoublement" BOOLEAN NOT NULL DEFAULT false,
    "statut" "StatutInscription" NOT NULL DEFAULT 'EN_COURS',
    "operationAdmissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "echeance" (
    "id" TEXT NOT NULL,
    "inscriptionId" TEXT NOT NULL,
    "type" "TypeEcheance" NOT NULL,
    "mois" DATE NOT NULL,
    "ordre" INTEGER NOT NULL,
    "montantDu" INTEGER NOT NULL,

    CONSTRAINT "echeance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiement" (
    "id" TEXT NOT NULL,
    "numeroRecu" TEXT NOT NULL,
    "etudiantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "montant" INTEGER NOT NULL,
    "mode" "ModePaiement" NOT NULL,
    "operateur" "OperateurMobile",
    "reference" TEXT,
    "observation" TEXT,
    "saisiParId" TEXT NOT NULL,
    "annule" BOOLEAN NOT NULL DEFAULT false,
    "annuleParId" TEXT,
    "dateAnnulation" TIMESTAMP(3),
    "motifAnnulation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiement_ligne" (
    "id" TEXT NOT NULL,
    "paiementId" TEXT NOT NULL,
    "echeanceId" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,

    CONSTRAINT "paiement_ligne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_admission" (
    "id" TEXT NOT NULL,
    "anneeSourceId" TEXT NOT NULL,
    "anneeCibleId" TEXT NOT NULL,
    "filiereId" TEXT NOT NULL,
    "niveauSource" INTEGER NOT NULL,
    "creeParId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "annulee" BOOLEAN NOT NULL DEFAULT false,
    "annuleeParId" TEXT,
    "dateAnnulation" TIMESTAMP(3),

    CONSTRAINT "operation_admission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligne_admission" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "etudiantId" TEXT NOT NULL,
    "decision" "DecisionAdmission" NOT NULL,
    "inscriptionSourceId" TEXT NOT NULL,
    "ancienStatutInscription" "StatutInscription" NOT NULL,
    "ancienStatutEtudiant" "StatutEtudiant" NOT NULL,
    "inscriptionCibleId" TEXT,

    CONSTRAINT "ligne_admission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compteur" (
    "cle" TEXT NOT NULL,
    "valeur" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "compteur_pkey" PRIMARY KEY ("cle")
);

-- CreateTable
CREATE TABLE "journal_audit" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entite" TEXT NOT NULL,
    "entiteId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "filiere_code_key" ON "filiere"("code");

-- CreateIndex
CREATE UNIQUE INDEX "annee_scolaire_libelle_key" ON "annee_scolaire"("libelle");

-- CreateIndex
CREATE UNIQUE INDEX "annee_scolaire_anneeDebut_key" ON "annee_scolaire"("anneeDebut");

-- CreateIndex
CREATE UNIQUE INDEX "tarif_filiereId_anneeScolaireId_niveau_key" ON "tarif"("filiereId", "anneeScolaireId", "niveau");

-- CreateIndex
CREATE UNIQUE INDEX "etudiant_matricule_key" ON "etudiant"("matricule");

-- CreateIndex
CREATE INDEX "etudiant_nom_prenoms_idx" ON "etudiant"("nom", "prenoms");

-- CreateIndex
CREATE INDEX "etudiant_filiereId_statut_idx" ON "etudiant"("filiereId", "statut");

-- CreateIndex
CREATE INDEX "inscription_anneeScolaireId_niveau_idx" ON "inscription"("anneeScolaireId", "niveau");

-- CreateIndex
CREATE UNIQUE INDEX "inscription_etudiantId_anneeScolaireId_key" ON "inscription"("etudiantId", "anneeScolaireId");

-- CreateIndex
CREATE INDEX "echeance_mois_idx" ON "echeance"("mois");

-- CreateIndex
CREATE UNIQUE INDEX "echeance_inscriptionId_ordre_key" ON "echeance"("inscriptionId", "ordre");

-- CreateIndex
CREATE UNIQUE INDEX "paiement_numeroRecu_key" ON "paiement"("numeroRecu");

-- CreateIndex
CREATE INDEX "paiement_etudiantId_idx" ON "paiement"("etudiantId");

-- CreateIndex
CREATE INDEX "paiement_date_idx" ON "paiement"("date");

-- CreateIndex
CREATE INDEX "paiement_ligne_echeanceId_idx" ON "paiement_ligne"("echeanceId");

-- CreateIndex
CREATE INDEX "journal_audit_entite_entiteId_idx" ON "journal_audit"("entite", "entiteId");

-- CreateIndex
CREATE INDEX "journal_audit_createdAt_idx" ON "journal_audit"("createdAt");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarif" ADD CONSTRAINT "tarif_filiereId_fkey" FOREIGN KEY ("filiereId") REFERENCES "filiere"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarif" ADD CONSTRAINT "tarif_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annee_scolaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etudiant" ADD CONSTRAINT "etudiant_filiereId_fkey" FOREIGN KEY ("filiereId") REFERENCES "filiere"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etudiant" ADD CONSTRAINT "etudiant_anneeEntreeId_fkey" FOREIGN KEY ("anneeEntreeId") REFERENCES "annee_scolaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etudiant" ADD CONSTRAINT "etudiant_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscription" ADD CONSTRAINT "inscription_etudiantId_fkey" FOREIGN KEY ("etudiantId") REFERENCES "etudiant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscription" ADD CONSTRAINT "inscription_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annee_scolaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscription" ADD CONSTRAINT "inscription_operationAdmissionId_fkey" FOREIGN KEY ("operationAdmissionId") REFERENCES "operation_admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echeance" ADD CONSTRAINT "echeance_inscriptionId_fkey" FOREIGN KEY ("inscriptionId") REFERENCES "inscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiement" ADD CONSTRAINT "paiement_etudiantId_fkey" FOREIGN KEY ("etudiantId") REFERENCES "etudiant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiement" ADD CONSTRAINT "paiement_saisiParId_fkey" FOREIGN KEY ("saisiParId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiement" ADD CONSTRAINT "paiement_annuleParId_fkey" FOREIGN KEY ("annuleParId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiement_ligne" ADD CONSTRAINT "paiement_ligne_paiementId_fkey" FOREIGN KEY ("paiementId") REFERENCES "paiement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiement_ligne" ADD CONSTRAINT "paiement_ligne_echeanceId_fkey" FOREIGN KEY ("echeanceId") REFERENCES "echeance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_admission" ADD CONSTRAINT "operation_admission_anneeSourceId_fkey" FOREIGN KEY ("anneeSourceId") REFERENCES "annee_scolaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_admission" ADD CONSTRAINT "operation_admission_anneeCibleId_fkey" FOREIGN KEY ("anneeCibleId") REFERENCES "annee_scolaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_admission" ADD CONSTRAINT "operation_admission_filiereId_fkey" FOREIGN KEY ("filiereId") REFERENCES "filiere"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_admission" ADD CONSTRAINT "operation_admission_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_admission" ADD CONSTRAINT "operation_admission_annuleeParId_fkey" FOREIGN KEY ("annuleeParId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_admission" ADD CONSTRAINT "ligne_admission_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "operation_admission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_admission" ADD CONSTRAINT "ligne_admission_etudiantId_fkey" FOREIGN KEY ("etudiantId") REFERENCES "etudiant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_audit" ADD CONSTRAINT "journal_audit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
