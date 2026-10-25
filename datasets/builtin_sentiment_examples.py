"""Authored draft training examples; review with fluent speakers before deployment.

Topics/places are shared across labels so danger words cannot determine tone.
Reported failures are reserved regression cases, not an independent benchmark.
"""
from cebuano_contrastive_examples import CHALLENGE as CEBUANO_CHALLENGE, normalize

REPORTED_CASES = [
    ("Maayo nga wala ka nagpataka og pasangil. Kini nga report sa Canbanua bahin sa fire incident makatabang sa among pag-amping. Padayon sa maayong pagpakabana.", "positive"),
    ("Nahadlok ko para sa mga tawo nga maagian niini. Kini nga report sa Canbanua bahin sa fire incident nakapadugang sa akong kabalaka. Dili ni angay pasagdan.", "negative"),
    ("Maayo nga wala ka nagpataka og pasangil. Kini nga report sa Canbanua bahin sa fire incident makatabang sa among pag-amping. Salamat sa pag-una sa kaluwasan.", "positive"),
]
CHECKS = {
    "cebuano": list(dict.fromkeys([*CEBUANO_CHALLENGE, *REPORTED_CASES,
        ("Nahadlok ko ug nabalaka para sa mga bata nga maagian niini.", "negative"),
        ("Wala na ko mahadlok kay luwas na mi ug nalipay ko.", "positive"),
        ("Wala pa koy impormasyon kon unsay hinungdan sa sunog.", "neutral"),
    ])),
    "english": [
        ("Wonderful", "positive"), ("Terrible", "negative"),
        ("Thank you for not blaming anyone without evidence.", "positive"),
        ("I am frightened and worried about the people near the fire.", "negative"),
        ("I appreciate the clear report about the fire and the safety precautions.", "positive"),
        ("The incident report was submitted at the office this morning.", "neutral"),
        ("You made an accusation without evidence and I am upset.", "negative"),
        ("The report does not identify the person involved.", "neutral"),
    ],
    "filipino": [
        ("Maganda ang serbisyo", "positive"),
        ("Nakakainis ang mabagal na serbisyo", "negative"),
        ("May pagpupulong bukas", "neutral"),
        ("Salamat dahil hindi ka basta nagbintang nang walang ebidensya.", "positive"),
        ("Natatakot ako at nag-aalala para sa mga taong malapit sa sunog.", "negative"),
        ("Ipinasa ang ulat sa opisina kaninang umaga.", "neutral"),
        ("Nakakagalit ang pagbibintang mo nang walang ebidensya.", "negative"),
    ],
}

STEMS = {
    "cebuano": {
        "positive": ["Maayo nga wala ka nagpataka og pasangil.", "Salamat sa imong maampingong pagpahimangno.",
                     "Bilib ko kay wala nimo gipasanginlan ang uban nga walay pruweba.",
                     "Nindot nga imong gitul-id ang sayop nga balita.", "Nalipay ko nga gipaambit nimo ang klarong detalye.",
                     "Dako akong pasalamat sa imong pag-amping sa uban."],
        "negative": ["Nahadlok ko para sa mga tawo nga maagian niini.", "Nakadugang kini sa akong kabalaka ug dili ko mahimutang.",
                     "Makaguol gyud ang kahimtang sa mga nanginahanglan og tabang.",
                     "Nasuko ko sa walay basihan nga pagpasangil.", "Makalagot nga wala tagda ang among hangyo.",
                     "Nasagmuyo ko ug wala ko malipay sa ilang pag-atiman."],
        "neutral": ["Wala pa koy dugang nga kasayuran gikan sa opisina.", "Unsang orasa nimo gisumite ang report?",
                    "Ang petsa ug lugar gisulat sa porma.", "Giingnan ko sa staff nga maghulat sa kumpirmasyon.",
                    "Wala ko didto sa dihang nahitabo kini.", "Dili pa klaro kon kinsa ang saksi."],
    },
    "filipino": {
        "positive": ["Mabuti at hindi ka basta nagbintang.", "Salamat sa maingat mong pagbibigay ng impormasyon.",
                     "Hinahangaan ko na hindi ka nagpakalat ng hindi kumpirmadong balita.",
                     "Masaya ako na itinama mo ang maling detalye.", "Malaking tulong ang malinaw mong paliwanag.",
                     "Nagpapasalamat ako sa malasakit mo sa iba."],
        "negative": ["Natatakot ako para sa mga taong maaapektuhan nito.", "Lalo akong nag-aalala at hindi ako mapakali.",
                     "Nakakalungkot ang kalagayan ng mga nangangailangan ng tulong.",
                     "Nagagalit ako sa mga walang batayang paratang.", "Nakakainis na hindi pinansin ang hiling namin.",
                     "Nadismaya ako at hindi nasiyahan sa pag-asikaso nila."],
        "neutral": ["Wala pang karagdagang impormasyon mula sa opisina.", "Anong oras mo ipinasa ang report?",
                    "Nakasulat sa form ang petsa at lokasyon.", "Sinabi ng staff na hintayin ang kumpirmasyon.",
                    "Wala ako roon nang mangyari iyon.", "Hindi pa malinaw kung sino ang saksi."],
    },
    "english": {
        "positive": ["It was responsible of you not to make an unsupported accusation.",
                     "Thank you for sharing the information carefully.", "I appreciate that you avoided spreading an unconfirmed claim.",
                     "I am pleased that you corrected the inaccurate detail.", "Your clear explanation has been helpful.",
                     "I am grateful for the care you showed toward others."],
        "negative": ["I am frightened for the people who may be affected.", "This has made me more anxious and I cannot settle down.",
                     "I feel sad about the situation of those waiting for assistance.",
                     "I am angry about the unsupported accusations.", "It is frustrating that our request was ignored.",
                     "I am disappointed and dissatisfied with how we were treated."],
        "neutral": ["There is no additional information from the office yet.", "What time did you submit the report?",
                    "The date and location are written on the form.", "The staff said to wait for confirmation.",
                    "I was not there when it happened.", "The witness has not yet been identified."],
    },
}


def training_examples():
    reserved = {(language, normalize(text)) for language, checks in CHECKS.items() for text, _ in checks}
    seen = set()
    rows = []
    topics = ("sunog", "fire incident", "vehicular accident", "streetlight outage", "lost item", "flooding")
    for language, labels in STEMS.items():
        for label, stems in labels.items():
            for stem in stems:
                for place in ("Canbanua", "Lamacan", "Poblacion"):
                    for topic in topics:
                        context = {"cebuano": f"Kini nga report sa {place} bahin sa {topic}.",
                                   "filipino": f"Tungkol sa {topic} sa {place} ang ulat na ito.",
                                   "english": f"This report concerns {topic} in {place}."}[language]
                        text = f"{stem} {context}"
                        key = language, normalize(text)
                        if key not in seen and key not in reserved:
                            seen.add(key)
                            rows.append({"text": text, "language": language, "label": label, "split": "train"})
    return rows
