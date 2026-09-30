import Image from "next/image";
import { connection } from "next/server";
import { ArrowRight, CircleCheck, Clock, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnTete } from "@/components/landing/en-tete";
import { FormulaireContact } from "@/components/landing/formulaire-contact";
import { PiedDePage } from "@/components/landing/pied-de-page";
import { ARRETES, ETABLISSEMENT, getCoordonnees } from "@/lib/etablissement";
import logo from "../../public/brand/logo-ifspa.png";
import photoHero from "../../public/images/illustration/hero-etudiants-1920.webp";
import photoInfirmier from "../../public/images/illustration/filiere-infirmier-1920.webp";
import photoSageFemme from "../../public/images/illustration/filiere-sage-femme-1920.webp";

const FILIERES = [
  {
    code: "IF",
    nom: "Infirmier(e)s",
    photo: photoInfirmier,
    alt: "Élève infirmière en tenue blanche préparant une seringue",
    texte:
      "Une formation aux soins infirmiers qui alterne enseignements théoriques, travaux pratiques et stages en milieu de soins.",
    points: ["Soins infirmiers et gestes techniques", "Stages en établissement de santé", "Titre reconnu dans la Fonction publique"],
    teinte: "bleu" as const,
  },
  {
    code: "SF",
    nom: "Sage-femmes",
    photo: photoSageFemme,
    alt: "Sage-femme s'occupant d'un nouveau-né en maternité",
    texte:
      "Une formation à l'accompagnement de la grossesse, de l'accouchement et des premiers jours du nouveau-né, avec stages en maternité.",
    points: ["Suivi de grossesse et accouchement", "Soins au nouveau-né", "Stages en maternité"],
    teinte: "rose" as const,
  },
];

export default async function Accueil() {
  // Coordonnées lues à chaque requête (modifiables dans Paramètres), jamais figées au build.
  await connection();
  const coord = await getCoordonnees();
  // Clé de test Cloudflare (valide toujours) tant que la vraie clé n'est pas configurée.
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA";

  return (
    <>
      {/* Hauteur fixe (h-8) : entre dans le calcul de la hauteur de l'ouverture (--hauteur-chrome). */}
      <div className="flex h-8 items-center justify-center bg-primary px-4 text-xs font-medium text-primary-foreground">
        <span className="truncate">
          Prototype — photos d&apos;illustration et contenus provisoires
          <span className="hidden sm:inline">, à valider par l&apos;institut</span>.
        </span>
      </div>
      <EnTete />

      <main className="flex-1">
        {/* ── Ouverture ── */}
        {/* Exactement un écran (100svh moins le bandeau et l'en-tête). La section reste collée
            sous l'en-tête pendant que le reste de la page glisse par-dessus et la recouvre. */}
        <section className="sticky top-18.25 z-0 isolate flex h-[calc(100svh-var(--hauteur-chrome))] min-h-136 items-center overflow-hidden">
          <div className="absolute inset-0 -z-10">
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
          <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(18_36_60/0.92)_0%,rgb(18_36_60/0.78)_45%,rgb(18_36_60/0.25)_100%)]" />
          {/* Voile qui s'assombrit à mesure que la photo est recouverte */}
          <div aria-hidden className="ouverture-voile absolute inset-0 -z-10 bg-[rgb(12_24_40)] opacity-0" />
          <div className="ouverture-texte mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="max-w-2xl text-white">
              <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                Se former aux métiers paramédicaux à Toamasina
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/85">
                L&apos;{ETABLISSEMENT.nom} est un établissement supérieur privé autorisé depuis 2011, qui forme en deux
                filières : Infirmier(e)s et Sage-femmes.
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <Button asChild size="lg" className="h-12 bg-rose-fonce px-6 text-white hover:bg-rose-fonce/90">
                  <a href="#filieres">
                    Découvrir les filières
                    <ArrowRight />
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
          <p className="absolute bottom-3 right-4 text-[11px] text-white/70">Photo d&apos;illustration</p>
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
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-primary after:mt-4 after:block after:h-1 after:w-12 after:rounded-full after:bg-rose after:content-[''] sm:text-4xl">
                Un institut de formation au service de la santé en Atsinanana
              </h2>
              <div className="mt-6 space-y-4 text-lg leading-relaxed text-muted-foreground">
                <p>
                  Implanté à Toamasina, l&apos;{ETABLISSEMENT.sigle} prépare ses étudiants aux métiers d&apos;infirmier(e)
                  et de sage-femme, dans le domaine « {ETABLISSEMENT.domaine} ».
                </p>
                <p>
                  La formation dispensée est habilitée par le ministère de l&apos;Enseignement supérieur, et le titre
                  délivré bénéficie d&apos;une équivalence administrative dans la Fonction publique.
                </p>
              </div>
            </div>
            <figure className="rounded-2xl bg-rose-pale p-8 sm:p-12">
              <Image src={logo} alt="Écusson de l'Institut de Formation Supérieur des Paramédicaux Atsinanana" className="mx-auto w-full max-w-md" />

            </figure>
          </div>
        </section>

        {/* ── Filières ── */}
        <section id="filieres" className="scroll-mt-20 border-t border-rose/20 bg-rose-pale/60">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight text-primary after:mt-4 after:block after:h-1 after:w-12 after:rounded-full after:bg-rose after:content-[''] sm:text-4xl">Nos filières</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Deux formations paramédicales, du premier jour jusqu&apos;au diplôme.
              </p>
            </div>

            <div className="mt-14 space-y-16 lg:space-y-24">
              {FILIERES.map((f, i) => (
                <article key={f.code} className="grid items-center gap-8 md:grid-cols-2 lg:gap-16">
                  <div className={`relative aspect-[4/3] overflow-hidden rounded-2xl ${i % 2 ? "md:order-2" : ""}`}>
                    <Image src={f.photo} alt={f.alt} fill placeholder="blur" sizes="(min-width: 768px) 50vw, 100vw" className="object-cover object-[center_30%]" />
                    <span className="absolute bottom-3 left-3 rounded bg-black/55 px-2 py-1 text-[11px] text-white">
                      Photo d&apos;illustration
                    </span>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <h3 className="text-3xl font-bold tracking-tight text-primary">{f.nom}</h3>
                      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${f.teinte === "rose" ? "bg-rose-pale text-rose-fonce" : "bg-bleu-pale text-primary"}`}>
                        <span className={`size-2 rounded-full ${f.teinte === "rose" ? "bg-rose" : "bg-bleu"}`} aria-hidden />
                        Code {f.code}
                      </span>
                    </div>
                    <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{f.texte}</p>
                    <ul className="mt-6 space-y-3">
                      {f.points.map((p) => (
                        <li key={p} className="flex items-start gap-3">
                          <CircleCheck className={`mt-0.5 size-5 shrink-0 ${f.teinte === "rose" ? "text-rose-fonce" : "text-bleu"}`} aria-hidden />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Agréments ── */}
        <section id="agrements" className="scroll-mt-20 border-t">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.6fr] lg:gap-20 lg:px-8 lg:py-28">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-primary after:mt-4 after:block after:h-1 after:w-12 after:rounded-full after:bg-rose after:content-[''] sm:text-4xl">Agréments officiels</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                L&apos;ouverture de l&apos;institut et la formation qu&apos;il dispense reposent sur des actes du ministère de
                l&apos;Enseignement supérieur et de la Recherche scientifique.
              </p>
            </div>
            <ol className="divide-y border-y">
              {ARRETES.map((a) => (
                <li key={a.reference} className="grid gap-1 py-5 sm:grid-cols-[4.5rem_1fr] sm:gap-6">
                  <span className="tabular font-heading text-2xl font-semibold text-rose-fonce">{a.annee}</span>
                  <div>
                    <p className="tabular font-semibold text-primary">Arrêté {a.reference}</p>
                    <p className="mt-1 text-muted-foreground">{a.objet}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Contact ── */}
        <section id="contact" className="scroll-mt-20 border-t bg-primary text-primary-foreground">
          <div className="mx-auto grid max-w-7xl items-start gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:gap-16 lg:px-8 lg:py-24">
          <div>
            <h2 className="text-3xl font-bold tracking-tight after:mt-4 after:block after:h-1 after:w-12 after:rounded-full after:bg-rose after:content-[''] sm:text-4xl">
              Nous contacter
            </h2>
            <p className="mt-4 max-w-xl text-lg text-primary-foreground/80">
              Le secrétariat vous renseigne sur les conditions d&apos;admission, les pièces à fournir et les frais de
              scolarité. Écrivez-nous, ou passez nous voir.
            </p>
            <dl className="mt-10 grid gap-8 sm:grid-cols-2">
              {[
                { icon: MapPin, label: "Adresse", value: coord.adresse ? `${coord.adresse}, ${coord.ville}` : null },
                { icon: Phone, label: "Téléphone", value: coord.telephone },
                { icon: Mail, label: "Courriel", value: coord.email },
                { icon: Clock, label: "Secrétariat", value: null },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex gap-4">
                  <Icon className="mt-1 size-5 shrink-0 text-rose" aria-hidden />
                  <div>
                    <dt className="text-sm font-medium text-primary-foreground/70">{label}</dt>
                    <dd className="mt-1 text-lg font-medium">
                      {value ?? <span className="italic text-rose-clair">À compléter</span>}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
          <FormulaireContact turnstileSiteKey={turnstileSiteKey} />
          </div>
        </section>
        </div>
      </main>

      <PiedDePage coord={coord} />
    </>
  );
}

