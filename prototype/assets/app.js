/* Prototype IFSPA — coquille commune (barre latérale, en-tête, rôles, dialogues, onglets).
   Chaque page déclare : <body data-page="..." data-fil="Groupe/Page"> puis
   <div class="coquille"><aside class="barre" data-barre></aside><div class="contenu"><header class="entete" data-entete></header><main class="page">…</main></div></div> */
(function () {
  const ICONES = {
    tableau: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    etudiants: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    admissions: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    encaisser: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    paiements: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    impayes: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    parametres: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/>',
    journal: '<path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/>',
    sortie: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    recherche: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    ok: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };
  const svg = (nom, attrs = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${attrs}>${ICONES[nom] || ""}</svg>`;

  // ── Rôle (deux comptes de démonstration) ──
  const params = new URLSearchParams(location.search);
  let role = params.get("role");
  try {
    if (role) localStorage.setItem("ifspa-role", role);
    else role = localStorage.getItem("ifspa-role");
  } catch (e) { /* stockage indisponible */ }
  role = role === "secretariat" ? "secretariat" : "admin";
  document.body.dataset.role = role;
  const UTIL = role === "admin"
    ? { nom: "Administrateur IFSPA", role: "Administrateur", initiales: "AD" }
    : { nom: "Hanitra RAKOTO", role: "Secrétariat", initiales: "HR" };

  const page = document.body.dataset.page;
  const NAV = [
    { groupe: "Pilotage", liens: [{ id: "dashboard", href: "dashboard.html", label: "Tableau de bord", icone: "tableau" }] },
    { groupe: "Scolarité", liens: [
      { id: "etudiants", href: "etudiants.html", label: "Étudiants", icone: "etudiants" },
      { id: "admissions", href: "admissions.html", label: "Admissions", icone: "admissions" },
    ] },
    { groupe: "Écolage", liens: [
      { id: "encaissement", href: "encaissement.html", label: "Encaisser", icone: "encaisser" },
      { id: "paiements", href: "paiements.html", label: "Paiements", icone: "paiements" },
      { id: "impayes", href: "impayes.html", label: "Impayés", icone: "impayes", compte: window.IFSPA ? IFSPA.GLOBAL.enRetard : null },
    ] },
    { groupe: "Administration", admin: true, liens: [
      { id: "parametres", href: "parametres.html", label: "Paramètres", icone: "parametres" },
    ] },
  ];

  const barre = document.querySelector("[data-barre]");
  if (barre) {
    barre.innerHTML = `
      <a class="barre-marque" href="dashboard.html"><img src="assets/img/logo-ifspa.png" alt=""><span><b>IFSPA</b><span>Gestion de l'écolage</span></span></a>
      <div class="barre-annee"><span><small>Année scolaire</small>2026-2027</span><span class="badge badge-sans-point" style="background:#2a4b75;color:#fff">En cours</span></div>
      <nav aria-label="Navigation de l'application">
        ${NAV.map((g) => `<div ${g.admin ? "data-admin" : ""}><div class="barre-groupe">${g.groupe}</div>${g.liens.map((l) => `
          <a href="${l.href}" ${l.id === page ? 'aria-current="page"' : ""}>${svg(l.icone)}${l.label}${l.compte ? `<span class="compte">${l.compte}</span>` : ""}</a>`).join("")}</div>`).join("")}
      </nav>
      <div class="barre-pied">
        <div class="barre-proto"><i></i>Prototype · données fictives</div>
        <div class="utilisateur">
          <span class="avatar-initiales">${UTIL.initiales}</span>
          <span><b>${UTIL.nom}</b><span>${UTIL.role}</span></span>
          <a href="connexion.html" title="Se déconnecter" aria-label="Se déconnecter">${svg("sortie")}</a>
        </div>
        <p style="margin:.75rem .5rem 0;font-size:.68rem;color:#8fa6c4">© 2027 IFSPA — Conçu et réalisé par <a href="https://portfolio-blue-iota-21.vercel.app/" target="_blank" rel="noopener" style="color:#c9d6e6">Diano ANDRIANTSALAMA</a></p>
      </div>`;
  }

  const entete = document.querySelector("[data-entete]");
  if (entete) {
    const fil = (document.body.dataset.fil || "").split("/").filter(Boolean);
    entete.innerHTML = `
      <button class="btn btn-fantome btn-icone bouton-menu" type="button" aria-label="Ouvrir le menu" data-menu>${svg("menu")}</button>
      <nav class="fil" aria-label="Fil d'Ariane">${fil.map((f, i) => {
        const [label, href] = f.split("|");
        return (i ? svg("chevron", 'style="width:14px;height:14px"') : "") + (href && i < fil.length - 1 ? `<a href="${href}">${label}</a>` : `<span${i === fil.length - 1 ? ' style="color:var(--texte);font-weight:600"' : ""}>${label}</span>`);
      }).join("")}</nav>
      <div class="recherche-globale">${svg("recherche")}<input class="saisie" type="search" placeholder="Rechercher un étudiant (nom, matricule)…" aria-label="Rechercher un étudiant"><kbd>Ctrl K</kbd></div>
      ${page !== "encaissement" ? `<a class="btn btn-accent" href="encaissement.html">${svg("plus")}<span class="masquer-mobile">Encaisser</span></a>` : ""}`;
  }

  // ── Interactions génériques ──
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-menu],[data-ouvrir],[data-fermer],[data-toast],[data-lien]");
    if (!t) { if (document.body.classList.contains("menu-ouvert") && !ev.target.closest(".barre")) document.body.classList.remove("menu-ouvert"); return; }
    if (t.hasAttribute("data-menu")) { document.body.classList.toggle("menu-ouvert"); ev.stopPropagation(); }
    if (t.dataset.ouvrir) { document.getElementById(t.dataset.ouvrir)?.showModal(); }
    if (t.hasAttribute("data-fermer")) { t.closest("dialog")?.close(); }
    if (t.dataset.toast) { toast(t.dataset.toast); }
    if (t.dataset.lien && !ev.target.closest("a,button,input,label")) { location.href = t.dataset.lien; }
  });

  function toast(message) {
    document.querySelector(".toast")?.remove();
    const el = document.createElement("div");
    el.className = "toast"; el.setAttribute("role", "status");
    el.innerHTML = `${svg("ok")}<span>${message}</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  // Onglets : <div class="onglets" data-onglets><button aria-controls="id">…</button></div> + panneaux [data-panneau="id"]
  document.querySelectorAll("[data-onglets]").forEach((liste) => {
    const boutons = [...liste.querySelectorAll("[aria-controls]")];
    function activer(id, maj) {
      boutons.forEach((b) => b.setAttribute("aria-selected", String(b.getAttribute("aria-controls") === id)));
      document.querySelectorAll("[data-panneau]").forEach((p) => { p.hidden = p.dataset.panneau !== id; });
      if (maj) history.replaceState(null, "", "#" + id);
    }
    boutons.forEach((b) => b.addEventListener("click", () => activer(b.getAttribute("aria-controls"), true)));
    const depuisUrl = location.hash.slice(1);
    activer(boutons.some((b) => b.getAttribute("aria-controls") === depuisUrl) ? depuisUrl : boutons[0].getAttribute("aria-controls"));
  });

  // Ouverture automatique d'un dialogue via ?dialogue=id (pour les captures)
  const dlg = params.get("dialogue");
  if (dlg) window.addEventListener("load", () => document.getElementById(dlg)?.showModal());

  window.PROTO = { svg, toast, role, UTIL };
})();
