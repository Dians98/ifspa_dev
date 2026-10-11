-- CreateIndex
CREATE UNIQUE INDEX "annee_scolaire_une_seule_courante" ON "annee_scolaire"("estCourante") WHERE ("estCourante" = true);

