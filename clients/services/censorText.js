const SENSITIVE_WORDS = [
  // Multi-word phrases first (order matters — longer phrases first)
  "son of a bitch", "motherfucker", "motherfucking",
  "putang ina", "putanginaa", "putangina", "ptangina", "ptngina",
  "tang ina", "tanginaa", "tangina",
  "nagtitinda ng droga", "adik sa droga",
  "drug pusher", "drug lord", "drug user",
  "sexual harassment", "panggahasa",
  "kill you", "kill him", "kill her", "kill them",
  "wag ka na bumalik", "hayop ka", "pakshet ka",
  "bomb threat",
  "linthead", "lokoka", "tangaaa", "boboo", "pakyuu",
  "putanginaa",

  // Profanity (English)
  "bullshit", "dumbass", "asshole",
  "fucking", "fucked", "fucker", "fucks", "fuck",
  "shitty", "shit",
  "bitches", "bitchy", "bitch",
  "bastards", "bastard",
  "goddamn", "dammit", "damn",
  "crappy", "crap",
  "dicks", "dick",
  "pissed", "piss",
  "cocks", "cock",
  "pussies", "pussy",
  "sluts", "slut",
  "whores", "whore",
  "asses", "ass",

  // Filipino / Tagalog / Bisaya
  "pisting", "pist",
  "siraulo", "demonyo", "satanas",
  "unggoy", "hayop",
  "pakshet", "pakyu",
  "punyeta", "letse", "leche",
  "buang", "bogo", "yawa", "byssat", "atinde",
  "ulol", "tanga", "bobo",
  "linta", "gagu", "gaga", "gago",
  "bilat", "titibo", "pekpek", "dede", "tete", "nengneng",
  "loko", "silahis", "jomsk",

  // Slurs & Discriminatory
  "nognog", "negro", "blackie",
  "bakla", "tomboy", "bayot", "bading", "beki",

  // Violent / Threatening
  "murderer", "murder",
  "stabbing", "stabbed", "stab",
  "shooting", "shoot",
  "explosion", "explode",
  "massacre", "slaughter", "revenge",
  "ganti", "barilin", "baril",
  "saksakin", "saksak",
  "papatayin", "patayin", "pumatay", "mamamatay",
  "guns", "gun",

  // Drug-related (sensitive in PH)
  "marijuana", "shabu", "cocaine",
  "apotek", "tokhang", "droga",
  "adik", "weed",

  // Sexual / Inappropriate
  "molestation", "molested", "molest",
  "pornography", "porn",
  "raping", "rapist", "raped", "rape",
  "groping", "groped", "grope",
  "naked", "nude", "sexually",
  "halay",
];

function censorText(text) {
  if (!text || typeof text !== "string") return text;

  let result = text;

  for (const word of SENSITIVE_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");
    result = result.replace(regex, "*".repeat(word.length));
  }

  return result;
}

export default censorText;
