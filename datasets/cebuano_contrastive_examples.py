"""Authored Cebuano tone examples, not real user experiences or model labels.

Training stems contrast responsible-reporting praise with accusations, complaints,
and factual updates. Contexts are intentionally shared across all labels: an
incident word or a barangay must not determine emotional tone on its own.
The challenge examples are regression checks, not an independent benchmark.
"""
from __future__ import annotations

import re

EXACT_REPORT = (
    "Maayo nga wala ka nagpataka og pasangil. Kini nga report sa Canbanua bahin sa "
    "fire incident makatabang sa among pag-amping. Padayon sa maayong pagpakabana."
)

TRAIN_STEMS = {
    "positive": [
        "Maayo nga wala ka nagpataka og pasangil.",
        "Salamat kay wala ka nagpakalat og tsismis.",
        "Bilib ko kay wala ka nagbintang nga walay ebidensya.",
        "Maayo kaayo nga wala nimo ginganlan ang tawo nga wala pa makumpirma.",
        "Salamat kay dili ka magpataka og tudlo og sad-an.",
        "Nindot nga wala nimo gipakalat ang sayop nga balita.",
        "Maayo nga wala ka miduol sa peligro.",
        "Mapasalamaton ko nga wala nimo gibabagan ang mga motabang.",
        "Salamat kay wala nimo gibutang sa peligro ang uban.",
        "Sakto ka nga wala magpataka og akusar.",
        "Maayo kaayo ang imong maampingong pagreport.",
        "Salamat sa klaro ug matinud-anong pagpahibalo.",
        "Bilib ko sa imong pagpakabana sa komunidad.",
        "Nindot kaayo ang imong pagtinabangay.",
        "Mapasalamaton kaayo ko sa imong tabang.",
        "Salamat sa imong pag-una sa kaluwasan sa uban.",
        "Maayo nga giangkon nimo nga dili pa sigurado ang detalye.",
        "Bilib ko kay wala nimo giusab ang istorya aron lang makapahadlok.",
        "Nindot nga wala ka nagpakaaron-ingnon nga eksperto.",
        "Salamat kay wala nimo gipakaulawan ang pamilya.",
        "Maayo kaayo nga gitul-id nimo ang sayop nga impormasyon.",
        "Nalipay ko nga nakit-an na ang nawala nga gamit.",
        "Dako kaayong tabang ang imong klarong pahimangno.",
        "Maayo nga wala ka mangdaot og tawo.",
        "Salamat sa imong pagkamatinud-anon bahin sa imong nakita.",
        "Nindot nga gipili nimo ang pag-amping kaysa pagpakalat og kahadlok.",
        "Buotan kaayo ka sa paghunahuna sa mga bata ug tigulang.",
        "Maayo kaayo imong serbisyo ug dako kini nga tabang.",
        "Nalipay ko ug proud ko sa imong maayong gibuhat.",
        "Dili ni bati; nindot kaayo imong pagtabang.",
        "Wala koy reklamo, maayo kaayo ang imong serbisyo.",
        "Dili ko masuko kay maayo ug matinahuron imong pagpasabot.",
    ],
    "negative": [
        "Nagpataka ka og pasangil.",
        "Nagpakalat ka og tsismis ug nasuko ko niini.",
        "Nagbintang ka nga walay ebidensya ug makalagot kini.",
        "Dili maayo nga imong gipakaulawan ang tawo.",
        "Bati kaayo ang imong serbisyo.",
        "Guba na kaayo ang gamit ug makalagot nga wala kini ayuha.",
        "Guba na kaayo.",
        "Dili ko gusto nimo.",
        "Wala gyud koy salig nimo kay namakak ka.",
        "Dili ko ganahan sa imong batasan.",
        "Makahadlok kaayo ang kahimtang ug nabalaka ko.",
        "Delikado kaayo kini ug nahadlok ko para sa mga bata.",
        "Makaguol kaayo nga adunay nasamdan.",
        "Makasubo ug sakit kaayo sa dughan ang nahitabo.",
        "Makalagot kaayo nga wala gihapon kini giatiman.",
        "Nasuko ko kay gisalikway ang among reklamo.",
        "Wala gyud ayo ang imong pagserbisyo.",
        "Dili kini maayo, bati kaayo ang resulta.",
        "Wala ko malipay sa imong gibuhat.",
        "Dili ko mapasalamaton kay imong gipasagdan ang mga nanginahanglan.",
        "Makalagot nga nagpataka ka og tudlo og sad-an.",
        "Nasakitan ko sa imong walay basihan nga akusasyon.",
        "Dili nindot imong pagpakalat og sayop nga balita.",
        "Wala ka nag-amping ug nabutang sa peligro ang uban.",
        "Wala ka motabang bisan nangayo mi og tabang, makaguol kaayo.",
        "Gipabayaan ninyo ang among kabalaka ug nasuko ko.",
        "Wala ko ganahi sa imong pagreport kay nagpasangil ka nga walay ebidensya.",
        "Bogo ka ug makalagot imong gibuhat.",
        "Buang ka nga nagbutang sa uban sa peligro.",
        "Dili ko mosalig aning makahahadlok nga kahimtang.",
        "Dili maayo ang nahitabo ug naguol ko para sa pamilya.",
        "Wala nay ayo kini nga guba nga kagamitan.",
    ],
    "neutral": [
        "Wala pa koy dugang impormasyon.",
        "Dili pa makumpirma ang ngalan sa tawo.",
        "Wala ko kakita sa tibuok panghitabo.",
        "Wala pa koy opisyal nga update gikan sa barangay.",
        "Dili ko sigurado unsang orasa kini nahitabo.",
        "Ang gisulat nako mao ra ang akong nakita.",
        "Naa ra ko sa balay karon.",
        "Kaila ko sa nagpost pero wala ko didto sa lugar.",
        "Wala nako maihap ang mga tawo sa daplin.",
        "Dili ako ang tag-iya sa gamit.",
        "Asa dapit ang tukmang agianan?",
        "Unsang petsaha gisumite ang report?",
    ],
}

ONE_WORDS = {
    "positive": ["salamat", "maayo", "nindot", "buotan", "mapasalamaton", "bilib", "malipayon", "maayohon", "maalamon", "madasigon", "gwapo", "gwapa"],
    "negative": ["makahadlok", "delikado", "makaguol", "makalagot", "nabalaka", "nasuko", "makasubo", "masakit", "kahadlok", "kasubo", "guba", "buang"],
    "neutral": ["kaila", "gyud", "man", "ani", "imong", "adlaw", "niya", "bai"],
}

CHALLENGE = [
    (EXACT_REPORT, "positive"),
    ("Maayo nga wala ka nagpataka og pasangil.", "positive"),
    ("Salamat kay wala ka nagpakalat og tsismis.", "positive"),
    ("Salamat nga wala nimo gipasanginlan dayon ang silingan.", "positive"),
    ("Bilib ko nimo kay wala ka moapil sa pagpangdaot.", "positive"),
    ("Maayo nga wala ka naghimo og istorya bahin sa sunog.", "positive"),
    ("Nindot nga wala ka magpataka og ingong sad-an siya.", "positive"),
    ("Salamat sa imong klarong report bahin sa bangga sa motor.", "positive"),
    ("Maayo nga wala ka nagpakalat og wala pa mapamatud-i.", "positive"),
    ("Salamat sa imong pagpakabana bisan makahahadlok ang sunog.", "positive"),
    ("Bilib ko sa imong kalma nga pagreport bahin sa aksidente.", "positive"),
    ("gwapo", "positive"),
    ("ka gwapo jud aning jobert oy", "positive"),
    ("gwapa ka", "positive"),
    ("salamat kaayo", "positive"),
    ("nindot kaayo", "positive"),
    ("Nagpataka ka og pasangil.", "negative"),
    ("Makalagot kay nagpasangil ka nga walay pruweba.", "negative"),
    ("Dili maayo nga nagpakalat ka og tsismis bahin sa silingan.", "negative"),
    ("Dili ko gusto nimo.", "negative"),
    ("guba na kaayo", "negative"),
    ("buang ka", "negative"),
    ("Delikado na", "negative"),
    ("Makahadlok kini para sa mga bata sa pikas balay.", "negative"),
    ("Makaguol nga adunay nasamad sa bangga.", "negative"),
    ("Nasuko ko sa imong bakak nga istorya bahin sa sunog.", "negative"),
    ("Dili nindot ang pag-akusar nga walay basihan.", "negative"),
    ("Wala gyud ayo ang serbisyo ninyo, nakadugang lang sa problema.", "negative"),
    ("kaila man ko ani niya oh", "neutral"),
    ("kaila man ko ani oh", "neutral"),
    ("kaila ko nimo", "neutral"),
    ("naa ra ko diri", "neutral"),
    ("Unsang oras gisumite ang report sa sunog?", "neutral"),
    ("Wala pa ko kabalo kinsa ang nagmaneho sa motor.", "neutral"),
    ("Naa ba ni sa Canbanua o sa Lamacan?", "neutral"),
    ("Dili pa klaro pila ka tawo ang naa sa lugar.", "neutral"),
    ("Wala pa mi nadawat nga kumpirmasyon.", "neutral"),
    ("Kaila ko sa tag-iya sa motor.", "neutral"),
]


def normalize(text: str) -> str:
    return re.sub(r"\W+", " ", text.casefold()).strip()


def build_training_rows() -> list[dict[str, str]]:
    contexts = [""] + [
        f"Bahin kini sa {topic} sa {place}."
        for topic in ("sunog", "aksidente", "nawala nga gamit", "fire incident", "vehicular accident", "flooding")
        for place in ("Lamacan", "Poblacion", "Langtad", "Canbanua")
    ]
    endings = {
        "positive": ["", "Salamat sa maayong pagpakabana."],
        "negative": ["", "Nabalaka ug naguol gyud ko."],
        "neutral": ["", "Nangutana ra ko sa detalye."],
    }
    reserved = {normalize(text) for text, _ in CHALLENGE}
    seen: set[str] = set()
    rows = []
    for label, stems in TRAIN_STEMS.items():
        texts = [" ".join(part for part in (stem, context, ending) if part)
                 for stem in stems for context in contexts for ending in endings[label]]
        texts.extend(ONE_WORDS[label])
        for text in texts:
            key = normalize(text)
            if key in seen or key in reserved:
                continue
            seen.add(key)
            rows.append({"text": text, "language": "cebuano", "label": label, "split": "train"})
    return rows
