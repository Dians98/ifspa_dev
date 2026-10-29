import type { Metadata } from "next";
import Image from "next/image";
import { connection } from "next/server";
import { ArrowRight, Clock, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnTete } from "@/components/landing/en-tete";
import { FormulaireContact } from "@/components/landing/formulaire-contact";
import { ChiffresCles } from "@/components/landing/chiffres-cles";
import { Reveal } from "@/components/motion/reveal";
import { FiliereAnimee } from "@/components/landing/filiere-animee";
import { FriseAgrements } from "@/components/landing/frise-agrements";
import { IconeFacebook } from "@/components/landing/icone-facebook";
import { PiedDePage } from "@/components/landing/pied-de-page";
import { ARRETES, COORDONNEES, DEVISE, ETABLISSEMENT, ETUDES, getCoordonnees } from "@/lib/etablissement";
import { DESCRIPTION_SITE, TITRE_SITE, URL_SITE } from "@/lib/site";
import logo from "../../public/brand/logo-ifspa.png";
import photoHero from "../../public/images/illustration/hero-etudiants-1920.webp";
import photoInfirmier from "../../public/images/illustration/filiere-infirmier-1920.webp";
import photoSageFemme from "../../public/images/illustration/filiere-sage-femme-1920.webp";
import galEncadrement from "../../public/images/galerie/encadrement-clinique.webp";
import galUrgence from "../../public/images/galerie/gestes-urgence.webp";
import galPrelevement from "../../public/images/galerie/prelevement-sanguin.webp";
import galSimulation from "../../public/images/galerie/simulation-mannequin.webp";
import galTension from "../../public/images/galerie/tension-arterielle.webp";
import { Galerie, type PhotoGalerie } from "@/components/landing/galerie";

// L'objet openGraph de la page remplace celui du layout : on le répète en entier, avec l'adresse de la page.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "IFSPA",
    title: TITRE_SITE,
    description: DESCRIPTION_SITE,
    url: "/",
  },
};

// Photos d'illustration (Pexels) à remplacer par les vraies photos de l'institut ; chacune est signalée comme telle.
const PHOTOS_GALERIE: PhotoGalerie[] = (
  [
  { src: galTension, legende: "Travaux pratiques : prise de la tension artérielle", alt: "Étudiantes s'exerçant à mesurer la tension artérielle" },
  { src: galSimulation, legende: "Simulation sur mannequin", alt: "Étudiants pratiquant des soins sur un mannequin de simulation" },
  { src: galPrelevement, legende: "Apprentissage du prélèvement sanguin", alt: "Étudiante préparant un prélèvement sanguin encadrée par une formatrice" },
  { src: photoSageFemme, legende: "Soins au nouveau-né en maternité", alt: "Sage-femme s'occupant d'un nouveau-né" },
  { src: galUrgence, legende: "Gestes d'urgence", alt: "Étudiants pratiquant des gestes d'urgence sur un mannequin" },
  { src: galEncadrement, legende: "Encadrement en salle de pratique clinique", alt: "Formatrice encadrant des étudiants en salle de pratique" },
  { src: photoInfirmier, legende: "Préparation d'une injection", alt: "Élève infirmière préparant une seringue" },
  { src: photoHero, legende: "Une promotion d'étudiants en tenue", alt: "Groupe d'étudiants en tenue de soins" },
  ] satisfies PhotoGalerie[]
).map((p) => ({ ...p, illustration: true }));

const PRESENTATION = `L'${ETABLISSEMENT.nom} est un établissement supérieur privé fondé en ${ETABLISSEMENT.anneeFondation} et autorisé depuis 2011, qui forme en ${ETUDES.dureeAnnees} ans des infirmier(e)s et des sages-femmes.`;

/** Mention posée sur une photo de banque d'images. */
function MentionIllustration({ className }: { className?: string }) {
  return (
    <span className={`pointer-events-none absolute rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white ${className ?? ""}`}>
      Photo d&apos;illustration
    </span>
  );
}

const FILIERES = [
  {
    code: "IF",
    nom: "Infirmier(e)s",
    photo: photoInfirmier,
    alt: "Élève infirmière en tenue blanche préparant une seringue",
    texte:
      "Trois ans de formation aux soins infirmiers : cours théoriques, travaux pratiques sur modèles anatomiques, puis stages auprès des patients.",
    points: ["Soins infirmiers et gestes techniques", "Stages en établissement de santé", "Titre reconnu dans la Fonction publique"],
    teinte: "bleu" as const,
  },
  {
    code: "SF",
    nom: "Sage-femmes",
    photo: photoSageFemme,
    alt: "Sage-femme s'occupant d'un nouveau-né en maternité",
    texte:
      "Trois ans de formation pour accompagner la grossesse, l'accouchement et les premiers jours du nouveau-né : cours théoriques, travaux pratiques, puis stages auprès des patients.",
    points: ["Suivi de grossesse et accouchement", "Soins au nouveau-né", "Stages en maternité"],
    teinte: "rose" as const,
  },
];

export default async function Accueil() {
  // Coordonnées lues à chaque requête (modifiables dans Paramètres), jamais figées au build.
  await connection();
  const coord = await getCoordonnees();
  // Sans clé (dev), le formulaire s'affiche sans widget anti-robot.
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined;

  // Données structurées : uniquement ce qui est affiché sur la page (les coordonnées non saisies sont omises).
  const institut = { "@id": `${URL_SITE}/#institut` };
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${URL_SITE}/#site`,
        url: `${URL_SITE}/`,
        name: ETABLISSEMENT.sigle,
        alternateName: ETABLISSEMENT.nom,
        inLanguage: "fr",
        publisher: institut,
      },
      {
        "@type": "CollegeOrUniversity",
        ...institut,
        name: ETABLISSEMENT.nom,
        alternateName: ETABLISSEMENT.sigle,
        description: PRESENTATION,
        foundingDate: String(ETABLISSEMENT.anneeFondation),
        ...(DEVISE && { slogan: DEVISE }),
        url: `${URL_SITE}/`,
        logo: `${URL_SITE}/brand/logo-ifspa.png`, // chemin public stable, pas l'URL hachée du build
        address: {
          "@type": "PostalAddress",
          ...(coord.adresse && { streetAddress: coord.adresse }),
          addressLocality: coord.ville,
          addressRegion: ETABLISSEMENT.region,
          addressCountry: "MG",
        },
        ...(coord.telephone && { telephone: coord.telephone }),
        ...(coord.email && { email: coord.email }),
      },
      ...FILIERES.map((f) => ({
        "@type": "EducationalOccupationalProgram",
        name: f.nom,
        description: f.texte,
        url: `${URL_SITE}/#filieres`,
        timeToComplete: `P${ETUDES.dureeAnnees}Y`,
        programPrerequisites: ETUDES.admission,
        provider: institut,
      })),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <a
        href="#contenu"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium text-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Aller au contenu
      </a>
      <EnTete />

      <main id="contenu" className="flex-1">
        {/* ── Ouverture ── */}
        {/* Exactement un écran (100svh moins l'en-tête). La section reste collée
            sous l'en-tête pendant que le reste de la page glisse par-dessus et la recouvre. */}
        <section className="sticky top-18.25 z-0 isolate flex h-[calc(100svh-var(--hauteur-chrome))] min-h-136 items-center overflow-hidden">
          <div className="accueil-dezoom absolute inset-0 -z-10">
            <Image
              src={photoHero}
              alt="Étudiants en tenue de soins posant en extérieur"
              fill
              priority
              placeholder="blur"
              sizes="100vw"
              className="object-cover object-[center_35%]"
            />
          </div>
          <MentionIllustration className="right-4 bottom-4 sm:right-6" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(18_36_60/0.92)_0%,rgb(18_36_60/0.78)_45%,rgb(18_36_60/0.25)_100%)]" />
          {/* Voile qui s'assombrit à mesure que la photo est recouverte */}
          <div aria-hidden className="ouverture-voile absolute inset-0 -z-10 bg-[rgb(12_24_40)] opacity-0" />
          <div className="ouverture-texte mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="max-w-2xl text-white">
              <h1 className="arrivee text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                Se former aux métiers paramédicaux à Toamasina
              </h1>
              <p className="arrivee mt-6 max-w-xl text-lg leading-relaxed text-white/85 [--rang:1]">
                {PRESENTATION}
              </p>
              <div className="arrivee mt-10 flex flex-wrap gap-3 [--rang:2]">
                <Button asChild size="lg" className="group/cta h-12 bg-rose-fonce px-6 text-white hover:bg-rose-fonce/90">
                  <a href="#filieres">
                    Découvrir les filières
                    <ArrowRight className="transition-transform duration-200 ease-out group-hover/cta:translate-x-1 motion-reduce:transition-none" />
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 border-white/60 bg-transparent px-6 text-white hover:bg-white/10 hover:text-white"
                >
                  <a href="#contact">Nous contacter</a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Tout ce qui suit l'ouverture glisse par-dessus elle */}
        <div className="relative z-10 bg-background shadow-[0_-28px_40px_-20px_rgb(12_24_40/0.45)]">
        {/* ── Bandeau d'agrément ── */}
        <div className="border-b border-rose/25 bg-rose-pale">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-sm text-rose-fonce sm:px-6 md:flex-row md:items-center md:gap-8 lg:px-8">
            <p className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-5 shrink-0" aria-hidden />
              Établissement agréé par le ministère de l&apos;Enseignement supérieur
            </p>
            <p className="tabular text-muted-foreground">
              Arrêté {ARRETES[0].reference} · Renouvellement du 3 avril 2024
            </p>
          </div>
        </div>

        {/* ── L'institut ── */}
        <section id="institut" className="scroll-mt-20">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-2 lg:gap-20 lg:px-8 lg:py-28">
            <Reveal>
              <h2 className="titre-section text-3xl font-bold tracking-tight text-primary after:mt-4 after:block after:h-1 after:w-12 after:rounded-full after:bg-rose after:content-[''] sm:text-4xl">
                Un institut de formation au service de la santé dans la région d&apos;Atsinanana
              </h2>
              <div className="mt-6 space-y-4 text-lg leading-relaxed text-muted-foreground">
                <p>
                  Fondé en {ETABLISSEMENT.anneeFondation} à Toamasina, l&apos;{ETABLISSEMENT.sigle} a pour mission de former des
                  infirmier(e)s et des sages-femmes compétents, dans le domaine «&nbsp;{ETABLISSEMENT.domaine}&nbsp;».
                </p>
                <p>
                  La formation dispensée est habilitée par le ministère de l&apos;Enseignement supérieur, et le titre
                  délivré bénéficie d&apos;une équivalence administrative dans la Fonction publique.
                </p>
              </div>
              {DEVISE && (
                <p className="mt-8 font-heading text-xl font-semibold text-rose-fonce">
                  <span className="sr-only">Devise de l&apos;institut : </span>
                  {DEVISE}
                </p>
              )}
            </Reveal>
            <Reveal as="figure" delai={0.15} className="rounded-2xl bg-rose-pale p-8 sm:p-12">
              <Image
                src={logo}
                alt="Écusson de l'Institut de Formation Supérieur des Paramédicaux Atsinanana"
                sizes="(min-width: 768px) 448px, 100vw"
                className="mx-auto w-full max-w-md"
              />
            </Reveal>
          </div>
        </section>

        {/* ── Chiffres clés ── */}
        <ChiffresCles />

        {/* ── Filières ── */}
        <section id="filieres" className="scroll-mt-20 border-t border-rose/20 bg-rose-pale/60">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <Reveal className="max-w-2xl">
              <h2 className="titre-section text-3xl font-bold tracking-tight text-primary after:mt-4 after:block after:h-1 after:w-12 after:rounded-full after:bg-rose after:content-[''] sm:text-4xl">Nos filières</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Deux formations paramédicales, du premier jour jusqu&apos;au diplôme.
              </p>
            </Reveal>

            <div className="mt-14 space-y-16 lg:space-y-24">
              {FILIERES.map((f, i) => (
                <FiliereAnimee
                  key={f.code}
                  photoADroite={i % 2 === 1}
                  teinte={f.teinte}
                  points={f.points}
                  photo={<Image src={f.photo} alt={f.alt} fill placeholder="blur" sizes="(min-width: 768px) 50vw, 100vw" className="object-cover object-[center_30%]" />}
                  mention={<MentionIllustration className="bottom-3 left-3" />}
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <h3 className="text-3xl font-bold tracking-tight text-primary">{f.nom}</h3>
                    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${f.teinte === "rose" ? "bg-rose-pale text-rose-fonce" : "bg-bleu-pale text-primary"}`}>
                      <span className={`size-2 rounded-full ${f.teinte === "rose" ? "bg-rose" : "bg-bleu"}`} aria-hidden />
                      Code {f.code}
                    </span>
                  </div>
                  <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{f.texte}</p>
                </FiliereAnimee>
              ))}
            </div>
          </div>
        </section>

        {/* ── Admission et études ── */}
        <section id="admission" className="scroll-mt-20 border-t">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.6fr] lg:gap-20 lg:px-8 lg:py-28">
            <Reveal>
              <h2 className="titre-section text-3xl font-bold tracking-tight text-primary after:mt-4 after:block after:h-1 after:w-12 after:rounded-full after:bg-rose after:content-[''] sm:text-4xl">
                Admission et études
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Les mêmes conditions valent pour les deux filières, Infirmier(e)s et Sage-femmes.
              </p>
            </Reveal>
            <dl className="divide-y border-y">
              {[
                { terme: "Durée des études", definition: `${ETUDES.dureeAnnees} ans, pour les Infirmier(e)s comme pour les Sage-femmes.` },
                { terme: "Conditions d'admission", definition: "Être titulaire du baccalauréat, série A, C ou D." },
                { terme: "Déroulement de la formation", definition: ETUDES.deroulement },
              ].map(({ terme, definition }, i) => (
                <Reveal key={terme} delai={i * 0.08} className="grid gap-1 py-5 sm:grid-cols-[13rem_1fr] sm:gap-6">
                  <dt className="font-semibold text-primary">{terme}</dt>
                  <dd className="text-muted-foreground">{definition}</dd>
                </Reveal>
              ))}
              <Reveal delai={0.24} className="grid gap-1 py-5 sm:grid-cols-[13rem_1fr] sm:gap-6">
                <dt className="font-semibold text-primary">Pièces et dates d&apos;inscription</dt>
                <dd className="text-muted-foreground">
                  Le secrétariat vous les communique : appelez le{" "}
                  <a href={`tel:${coord.telephone.replace(/\s/g, "")}`} className="font-medium text-primary underline underline-offset-4">
                    {coord.telephone}
                  </a>{" "}
                  ou{" "}
                  <a href="#contact" className="font-medium text-primary underline underline-offset-4">
                    écrivez-nous
                  </a>
                  .
                </dd>
              </Reveal>
            </dl>
          </div>
        </section>

        {/* ── Galerie ── */}
        <section id="galerie" className="scroll-mt-20 border-t pb-20 lg:pb-28">
          <div className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 lg:px-8 lg:pt-28">
            <Reveal className="mb-10 max-w-2xl">
              <h2 className="titre-section text-3xl font-bold tracking-tight text-primary after:mt-4 after:block after:h-1 after:w-12 after:rounded-full after:bg-rose after:content-[''] sm:text-4xl">
                Galerie
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Travaux pratiques et gestes de soins, en images.
              </p>
            </Reveal>
          </div>
          <Galerie photos={PHOTOS_GALERIE} />
        </section>

        {/* ── Agréments ── */}
        <section id="agrements" className="scroll-mt-20 border-t">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.6fr] lg:gap-20 lg:px-8 lg:py-28">
            <Reveal>
              <h2 className="titre-section text-3xl font-bold tracking-tight text-primary after:mt-4 after:block after:h-1 after:w-12 after:rounded-full after:bg-rose after:content-[''] sm:text-4xl">Agréments officiels</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                L&apos;ouverture de l&apos;institut et la formation qu&apos;il dispense reposent sur des actes du ministère de
                l&apos;Enseignement supérieur et de la Recherche scientifique.
              </p>
            </Reveal>
            <FriseAgrements arretes={ARRETES} />
          </div>
        </section>

        {/* ── Contact ── */}
        <section id="contact" className="scroll-mt-20 border-t bg-primary text-primary-foreground">
          <div className="mx-auto grid max-w-7xl items-start gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:gap-16 lg:px-8 lg:py-24">
          <Reveal>
            <h2 className="titre-section text-3xl font-bold tracking-tight after:mt-4 after:block after:h-1 after:w-12 after:rounded-full after:bg-rose after:content-[''] sm:text-4xl">
              Nous contacter
            </h2>
            <dl className="mt-10 divide-y divide-white/15 border-y border-white/15">
              {[
                { icon: MapPin, label: "Adresse", value: `${coord.adresse}, ${coord.ville}` },
                {
                  icon: Phone,
                  label: "Téléphone",
                  value: (
                    <a href={`tel:${coord.telephone.replace(/\s/g, "")}`} className="underline-offset-4 hover:underline">
                      {coord.telephone}
                    </a>
                  ),
                },
                {
                  icon: Mail,
                  label: "Courriel",
                  value: (
                    <>
                      <a href={`mailto:${coord.email}`} className="underline-offset-4 [overflow-wrap:anywhere] hover:underline">
                        {coord.email}
                      </a>
                      {" / "}
                      <a href={`mailto:${COORDONNEES.emailAdmin}`} className="underline-offset-4 [overflow-wrap:anywhere] hover:underline">
                        {COORDONNEES.emailAdmin}
                      </a>
                    </>
                  ),
                },
                {
                  icon: Clock,
                  label: "Horaires du secrétariat",
                  value: (
                    <span className="flex flex-wrap gap-x-4">
                      {COORDONNEES.horaires.map((plage) => (
                        <span key={plage} className="whitespace-nowrap">
                          {plage}
                        </span>
                      ))}
                    </span>
                  ),
                },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex gap-4 py-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-rose" aria-hidden>
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-sm font-medium text-primary-foreground/70">{label}</dt>
                    <dd className="mt-0.5 text-lg font-medium">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
            <div className="mt-8 flex items-center gap-4">
              <p className="text-sm font-medium text-primary-foreground/70">Suivez-nous</p>
              <a
                href={COORDONNEES.facebookUrl}
                target="_blank"
                rel="noopener"
                className="grid size-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <IconeFacebook className="size-5" />
                <span className="sr-only">Page Facebook « {COORDONNEES.facebook} » (nouvel onglet)</span>
              </a>
            </div>
          </Reveal>
          <Reveal delai={0.15}>
            <FormulaireContact turnstileSiteKey={turnstileSiteKey} />
          </Reveal>
          </div>
        </section>
        </div>
      </main>

      <PiedDePage coord={coord} />
    </>
  );
}

