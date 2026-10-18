"""Remplit le modèle téléchargé à l'écran (Reprise des données) pour les fichiers d'essai de UC15.

    python -I recette/parcours/fabriquer-fichiers-reprise.py <dossier des fichiers>

Le dossier doit contenir le modèle téléchargé (modele-import-ifspa-2026-2027.xlsx) et, pour les cas CSV, les deux CSV
téléchargés (modele-etudiants-2026-2027.csv, modele-paiements-2026-2027.csv). Le classeur reste celui de
l'application : on ne remplace que les lignes d'exemple (à partir de la ligne 3) des feuilles Étudiants et Paiements.
"""
import re
import sys
import zipfile
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

DOSSIER = Path(sys.argv[1])
MODELE = DOSSIER / "modele-import-ifspa-2026-2027.xlsx"

STYLE_TEXTE = 4
STYLE_DATE = 5
COLONNES_TEXTE = {"Étudiants": {"G", "H"}, "Paiements": {"G"}}
LETTRES = "ABCDEFGHIJKLMN"
FEUILLES = {"Étudiants": "xl/worksheets/sheet2.xml", "Paiements": "xl/worksheets/sheet3.xml"}


def d(jour: int, mois: int, annee: int) -> date:
    return date(annee, mois, jour)


def cellule(feuille: str, colonne: str, ligne: int, valeur) -> str:
    ref = f"{colonne}{ligne}"
    texte = colonne in COLONNES_TEXTE[feuille]
    style = f' s="{STYLE_TEXTE}"' if texte else ""
    if valeur is None or valeur == "":
        return f'<c r="{ref}"{style}/>' if texte else ""
    if isinstance(valeur, date):
        return f'<c r="{ref}" s="{STYLE_DATE}"><v>{(valeur - date(1899, 12, 30)).days}</v></c>'
    if isinstance(valeur, int):
        return f'<c r="{ref}"><v>{valeur}</v></c>'
    return f'<c r="{ref}"{style} t="inlineStr"><is><t xml:space="preserve">{escape(str(valeur))}</t></is></c>'


def lignes_xml(feuille: str, lignes: list[list]) -> str:
    sortie = []
    for i, valeurs in enumerate(lignes):
        n = i + 3
        cellules = "".join(cellule(feuille, LETTRES[j], n, v) for j, v in enumerate(valeurs))
        sortie.append(f'<row r="{n}">{cellules}</row>')
    return "".join(sortie)


def remplir(nom: str, etudiants: list[list], paiements: list[list]) -> None:
    sortie = DOSSIER / nom
    with zipfile.ZipFile(MODELE) as source, zipfile.ZipFile(sortie, "w", zipfile.ZIP_DEFLATED) as cible:
        for info in source.infolist():
            contenu = source.read(info.filename)
            for feuille, chemin in FEUILLES.items():
                if info.filename == chemin:
                    xml = contenu.decode("utf-8")
                    debut = xml.index('<row r="3"')
                    fin = xml.index("</sheetData>")
                    lignes = etudiants if feuille == "Étudiants" else paiements
                    xml = xml[:debut] + lignes_xml(feuille, lignes) + xml[fin:]
                    contenu = xml.encode("utf-8")
            if info.filename == "xl/styles.xml":
                xml = contenu.decode("utf-8")
                xml = xml.replace('<cellXfs count="5">', '<cellXfs count="6">')
                xml = xml.replace("</cellXfs>", '<xf numFmtId="14" applyNumberFormat="1"></xf></cellXfs>')
                contenu = xml.encode("utf-8")
            cible.writestr(info.filename, contenu)
    print("écrit", sortie.name)


def echapper_csv(v) -> str:
    v = "" if v is None else str(v)
    return f'"{v.replace(chr(34), chr(34) * 2)}"' if re.search(r'[;"\r\n]', v) else v


def remplir_csv(nom: str, modele: str, lignes: list[list]) -> None:
    entete = (DOSSIER / modele).read_bytes().decode("utf-8-sig").split("\r\n")[:2]
    corps = [";".join(echapper_csv(v) for v in ligne) for ligne in lignes]
    (DOSSIER / nom).write_bytes(("﻿" + "\r\n".join(entete + corps) + "\r\n").encode("utf-8"))
    print("écrit", nom)


# Étudiants : N°, Nom, Prénoms, Sexe, Naissance, Lieu, CIN, Téléphone, Adresse, Filière, Année d'entrée, Niveau, Redoublant, Droits en
# Paiements : N° étudiant, Date, Montant, Mode, Opérateur, Référence, N° reçu papier

NOMINAL_ETUDIANTS = [
    [1, "RANDRIANASOLO", "Haingo Mirana", "F", d(14, 3, 2007), "Toamasina", None, "034 00 000 11", "Lot 12 Tanambao V", "IF", 2026, 1, "non", 3],
    [2, "RAZANAKOLONA", "Miora", "F", d(2, 11, 2006), "Fénérive-Est", None, "034 00 000 12", "Ankirihiry", "SF", 2026, 1, "non", 1],
    [3, "RAKOTONDRAZAFY", "Fidy Andry", "M", d(21, 7, 2005), "Brickaville", "501011012345", "034 00 000 13", "Morarano", "IF", 2025, 2, "non", 1],
    [4, "RAVELOSON", "Tahiana", "F", d(9, 2, 2005), "Vatomandry", None, "034 00 000 14", "Ambohijafy", "SF", 2025, 2, "non", 2],
    [5, "ANDRIANTSOA", "Mamy", "M", d(30, 5, 2007), "Mahanoro", None, "034 00 000 15", "Tanambao II", "IF", 2026, 1, "non", 1],
    [6, "RANAIVOSOA", "Lova Hasina", "F", d(11, 12, 2006), "Toamasina", None, "034 00 000 16", "Ampasimazava", "SF", 2025, 1, "oui", 1],
]
NOMINAL_PAIEMENTS = [
    [1, d(5, 10, 2026), 114000, "Espèces", None, None, "0412"],
    [1, d(15, 10, 2026), 33000, "Mobile Money", "Orange Money", None, "0430"],
    [2, d(8, 10, 2026), 180000, "Mobile Money", "MVola", "MP261008.1432.A1", "0420"],
    [3, d(3, 10, 2026), 100000, "Espèces", None, None, "0398"],
    [3, d(12, 10, 2026), 80000, "Espèces", None, None, "0415"],
    [4, d(10, 10, 2026), 50000, "Espèces", None, None, "0421"],
    [6, d(14, 10, 2026), 130000, "Espèces", None, None, "0425"],
]

if __name__ == "__main__":
    remplir("reprise-ifspa-2026-2027.xlsx", NOMINAL_ETUDIANTS, NOMINAL_PAIEMENTS)

    # Le même fichier, complété d'un septième étudiant et de son paiement (relance).
    remplir(
        "reprise-complement.xlsx",
        NOMINAL_ETUDIANTS + [[7, "RAMAROSON", "Kanto", "M", d(4, 4, 2006), "Moramanga", None, "034 00 000 17", "Tanambao I", "IF", 2026, 1, "non", 1]],
        NOMINAL_PAIEMENTS + [[7, d(16, 10, 2026), 90000, "Espèces", None, None, "0432"]],
    )

    # Saisies fautives, en texte : dates, sexe, filière, téléphone, N° en double, ligne d'exemple restée.
    remplir(
        "reprise-en-erreur.xlsx",
        [
            [1, "RAKOTOVELO", "Haingo", "F", "14/03/2007", "Toamasina", None, "034 00 000 21", "Tanambao V", "IF", 2026, 1, "non", 1],
            [2, "RAKOTOARISOA", "Nomena", "X", "02/11/2006", "Foulpointe", None, "034 00 000 22", "Ankirihiry", "SF", 2026, 1, "non", 1],
            [3, "RAZANAKOLONA", "Mbolatiana", "F", "31/02/2006", "Brickaville", None, "034 00 000 23", "Morarano", "IF", 2026, 1, "non", 1],
            [4, "RAVELOSON", "Tsiory", "M", "09/02/2005", "Vatomandry", None, "034 00 000 24", "Ambohijafy", "XX", 2026, 1, "non", 1],
            [5, "RAKOTOMALALA", "Hanitra Mialy", "F", "14/03/2007", "Toamasina", None, "034 12 345 67", "Lot II A 12 Tanambao V", "IF", 2026, 1, "non", 3],
            [1, "ANDRIANTSOA", "Mamy", "M", "30/05/2007", "Mahanoro", None, "034 00 000 25", "Tanambao II", "IF", 2026, 1, "non", 1],
            [7, "RAMANANTSOA", "Fenitra", "M", "17/09/2006", "Mahanoro", None, "034 00", "Tanambao II", "IF", 2026, 1, "non", 1],
        ],
        [
            [1, "05/10/2026", "cent mille", "Espèces", None, None, "0412"],
            [1, "06/10/2026", 0, "Espèces", None, None, "0413"],
            [9, "06/10/2026", 80000, "Espèces", None, None, "0414"],
            [1, "30/12/2026", 80000, "Espèces", None, None, "0415"],
            [1, "07/10/2026", 80000, "Mobile Money", None, "MP261007.1111.B2", "0416"],
        ],
    )

    # Année d'entrée 2024 absente de Paramètres › Années, et filière KI sans tarif en 2026-2027.
    remplir(
        "reprise-annee-absente-tarif-manquant.xlsx",
        [
            [1, "RAKOTOVAO", "Aina", "F", d(8, 8, 2003), "Toamasina", None, "034 00 000 41", "Tanambao V", "SF", 2024, 3, "non", 1],
            [2, "RAZAFIMANANA", "Toky", "M", d(19, 1, 2007), "Fénérive-Est", None, "034 00 000 42", "Ankirihiry", "KI", 2026, 1, "non", 1],
            [3, "RASOLOFOARISON", "Volatiana", "F", d(23, 6, 2007), "Toamasina", None, "034 00 000 43", "Morarano", "IF", 2026, 1, "non", 1],
        ],
        [
            [3, d(6, 10, 2026), 100000, "Espèces", None, None, "0450"],
        ],
    )

    # Trop-perçu : un paiement unique trop grand, deux paiements qui dépassent à eux deux, et un paiement exact.
    remplir(
        "reprise-trop-percu.xlsx",
        [
            [1, "RAKOTOVAO", "Aina", "F", d(8, 8, 2007), "Toamasina", None, "034 00 000 51", "Tanambao V", "IF", 2026, 1, "non", 1],
            [2, "RASOLOFOMANANA", "Voahangy", "F", d(25, 4, 2006), "Fénérive-Est", None, "034 00 000 52", "Ankirihiry", "SF", 2026, 1, "non", 1],
            [3, "RAKOTOMANANA", "Zo Lalaina", "M", d(2, 9, 2006), "Brickaville", None, "034 00 000 53", "Morarano", "IF", 2026, 1, "non", 1],
        ],
        [
            [1, d(6, 10, 2026), 950000, "Espèces", None, None, "0460"],
            [2, d(5, 10, 2026), 500000, "Espèces", None, None, "0461"],
            [2, d(6, 10, 2026), 500000, "Espèces", None, None, "0462"],
            [3, d(7, 10, 2026), 900000, "Espèces", None, None, "0463"],
        ],
    )

    # Variante deux CSV (dates en texte, comme après « Enregistrer sous » en CSV).
    if (DOSSIER / "modele-etudiants-2026-2027.csv").exists():
        remplir_csv(
            "etudiants-2026-2027.csv",
            "modele-etudiants-2026-2027.csv",
            [
                [1, "RAKOTOZAFY", "Njaka", "M", "18/08/2006", "Toamasina", "", "034 00 000 31", "Tanambao V", "IF", 2026, 1, "non", 1],
                [2, "RANDRIANTSIMBA", "Mahery Tsiky", "F", "05/05/2006", "Fénérive-Est", "", "034 00 000 32", "Ankirihiry", "SF", 2026, 1, "non", 2],
            ],
        )
        remplir_csv(
            "paiements-2026-2027.csv",
            "modele-paiements-2026-2027.csv",
            [
                [1, "04/10/2026", 180000, "Mobile Money", "Airtel Money", "AM261004.0912.C7", "0440"],
                [2, "09/10/2026", 50000, "Espèces", "", "", "0441"],
            ],
        )

    # Dépôts refusés avant l'envoi : ancien format, fichier trop gros, faux classeur.
    (DOSSIER / "liste-etudiants-ancienne.xls").write_bytes(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 512)
    (DOSSIER / "trop-gros.csv").write_bytes(b"a" * (1024 * 1024 + 1))
    (DOSSIER / "faux-classeur.xlsx").write_bytes("Ceci est un texte enregistré avec l'extension .xlsx.\n".encode("utf-8"))
    contenu = "\ufeffN° *;Nom *;Prénoms *\r\n1;RAKOTOVELO;Haingo\r\n"
    (DOSSIER / "etudiants-incomplet.csv").write_bytes(contenu.encode("utf-8"))
    print("écrit liste-etudiants-ancienne.xls, trop-gros.csv, faux-classeur.xlsx, etudiants-incomplet.csv")
