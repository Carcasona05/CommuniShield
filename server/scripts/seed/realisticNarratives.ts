/** Authored simulation fixtures, not AI predictions or real incident records. */
export type FixtureLanguage = "cebuano" | "filipino" | "english";
type Label = "negative" | "neutral" | "positive" | "mixed";
type Severity = "Low" | "Medium" | "High" | "Critical";
type Translated = Record<FixtureLanguage, string>;
type Scenario = {
  topic: Translated;
  observation: Translated;
  question: Translated;
  advice: Translated;
  followup: Translated;
  severity: Severity;
};

const scenarios: Record<string, Scenario> = {
  Theft: {
    topic: { cebuano: "nawalang bag", filipino: "nawalang bag", english: "missing bag" },
    observation: {
      cebuano: "Pagbalik nako gikan pagpalit, wala na akong bag sa lingkoranan. Wala ko kakita kinsay mikuha, basin nabalhin ra pud. Nabalaka ko kay naa didto akong mga gamit sa trabaho.",
      filipino: "Pagbalik ko mula sa tindahan, wala na ang bag sa upuan. Hindi ko nakita kung may kumuha o may naglipat lang. Nandoon ang gamit ko sa trabaho kaya nag-aalala ako.",
      english: "My bag was missing when I returned from the shop. I did not see anyone take it, so I cannot say whether it was stolen or moved. My work things were inside and I am worried.",
    },
    question: { cebuano: "Nakapangutana na ka sa tindahan basin naa sa lost-and-found?", filipino: "Naitanong na po sa tindahan kung may nagsauli?", english: "Have you checked whether someone handed it to the shop?" },
    advice: { cebuano: "Ayaw lang sa ta pagngalan og tawo nga walay ebidensya. Itago ang resibo kon naa.", filipino: "Huwag munang magpangalan ng tao nang walang ebidensya. Itabi ang anumang resibo.", english: "Please do not identify a suspect without evidence. Keep any receipt you have." },
    followup: { cebuano: "Update: nakit-an sa staff ang bag sa pikas lingkoranan. Gihunong na ang pagpangita.", filipino: "Update: nakita ng staff ang bag sa ibang upuan. Natapos na ang paghahanap.", english: "Update: staff found the bag on another seat. The search has ended." }, severity: "Medium",
  },
  "Public Disturbance": {
    topic: { cebuano: "kusog nga panaglalis", filipino: "malakas na pagtatalo", english: "loud argument" },
    observation: { cebuano: "Naay kusog nga panaglalis sa gawas. Nadungog sa among balay pero wala ko kakita og sinumbagay. Nabalaka ang mga bata, basin pwede ma-check sa tanod.", filipino: "May malakas na pagtatalo sa labas, rinig hanggang bahay. Wala akong nakitang suntukan. Natatakot ang mga bata, baka puwedeng matingnan ng tanod.", english: "A loud argument outside could be heard from our house. I did not see a fight. The children were frightened, so I am asking if a tanod can check." },
    question: { cebuano: "Nagpadayon pa ang lalis o nilakaw na sila?", filipino: "Tuloy pa ba ang pagtatalo o umalis na sila?", english: "Is the argument continuing or have they left?" },
    advice: { cebuano: "Ayaw sa pagduol kon init pa ang lalis. Tawagi ang barangay kon kinahanglan.", filipino: "Huwag lumapit habang mainit ang pagtatalo. Tumawag sa barangay kung kailangan.", english: "Keep some distance while tempers are raised. Contact the barangay if needed." },
    followup: { cebuano: "Update: nahunong ang lalis ug nilakaw na sila. Hilom na balik.", filipino: "Update: natigil ang pagtatalo at umalis na sila. Tahimik na ulit.", english: "Update: the argument stopped and the people left. It is quiet again." }, severity: "Low",
  },
  "Vehicular Accident": {
    topic: { cebuano: "bangga sa motor", filipino: "banggaan ng motor", english: "motorcycle collision" },
    observation: { cebuano: "Nakita nako ang duha ka motor nga nagbangga. Ang usa ka rider naglingkod sa kilid ug nagreklamo sa tiil. Wala ko kahibalo sa hinungdan, ug dili ko makasulti unsa kabug-at ang iyang samad.", filipino: "Nakita kong nagbanggaan ang dalawang motor. Nasa gilid ang isang rider at masakit daw ang paa. Hindi ko alam ang sanhi o kung gaano kabigat ang pinsala.", english: "I saw two motorcycles collide. One rider was sitting at the side complaining of foot pain. I do not know the cause and cannot assess the injury." },
    question: { cebuano: "Naa nay nitawag og tabang para sa rider?", filipino: "May nakatawag na po ba ng tulong para sa rider?", english: "Has someone already called for help for the rider?" },
    advice: { cebuano: "Ayaw ibalhin ang nasamdan gawas kon naay diha-diha nga peligro. Hatagi og agianan ang responders.", filipino: "Huwag ilipat ang nasugatan maliban kung may agarang panganib. Magbigay-daan sa responders.", english: "Do not move an injured person unless there is immediate danger. Leave access for responders." },
    followup: { cebuano: "Update: natabangan na ang rider ug na-clear ang lane. Wala koy medical update.", filipino: "Update: natulungan na ang rider at maluwag na ang lane. Wala akong medical update.", english: "Update: the rider received assistance and the lane was cleared. I have no medical update." }, severity: "High",
  },
  "Reckless Driving": {
    topic: { cebuano: "kusog nga pagpadagan", filipino: "mabilis na pagpapatakbo", english: "fast driving" },
    observation: { cebuano: "Naay motor nga kusog kaayo mopadagan duol sa mga naglakaw. Mikalit og preno ang tricycle. Wala ko kabasa sa plaka, dili ko gusto magtagna kinsay rider.", filipino: "May motor na mabilis dumaan malapit sa mga naglalakad. Napapreno ang tricycle. Hindi ko nabasa ang plaka at ayokong manghula kung sino ang rider.", english: "A motorcycle passed very fast close to pedestrians and a tricycle braked suddenly. I could not read the plate and will not guess who was riding." },
    question: { cebuano: "Sa kurbada ba ni o sa tul-id nga bahin?", filipino: "Sa kurbada po ba o sa tuwid na bahagi?", english: "Was this near the bend or on the straight section?" },
    advice: { cebuano: "Ayaw gukda ang motor. Ilista lang ang oras ug lugar kon luwas.", filipino: "Huwag habulin ang motor. Itala ang oras at lugar kung ligtas.", english: "Do not chase the motorcycle. Note the time and location if safe." },
    followup: { cebuano: "Update: nahuman ang pag-check sa dalan. Wala koy kumpirmadong identidad sa rider.", filipino: "Update: tapos na ang pag-check sa daan. Walang kumpirmadong pagkakakilanlan ng rider.", english: "Update: the road check is complete. The rider has not been identified." }, severity: "Medium",
  },
  "Fire Incident": {
    topic: { cebuano: "aso ug siga", filipino: "usok at apoy", english: "smoke and flames" },
    observation: { cebuano: "Nakita nako ang itom nga aso ug siga gikan sa gamay nga estruktura. Mipalayo mi. Dili klaro kon naay tawo sa sulod, ug wala ko mahibalo sa hinungdan sa sunog.", filipino: "May nakita akong maitim na usok at apoy mula sa maliit na istruktura. Lumayo kami. Hindi malinaw kung may tao sa loob o ano ang sanhi ng sunog.", english: "I saw dark smoke and flames from a small structure and moved away. I cannot confirm whether anyone was inside or what started the fire." },
    question: { cebuano: "Naa nay nakatawag sa bombero, ug luwas na mo?", filipino: "May tumawag na po sa bumbero at nasa ligtas na lugar na kayo?", english: "Has the fire service been contacted, and are you in a safe place?" },
    advice: { cebuano: "Ayaw sulod balik para sa gamit. Palayo ug ayaw babagan ang agianan sa bombero.", filipino: "Huwag bumalik para sa gamit. Lumayo at huwag harangan ang daan ng bumbero.", english: "Do not re-enter for belongings. Move away and keep access clear for firefighters." },
    followup: { cebuano: "Update: wala na koy makita nga siga gikan sa luwas nga lugar. Hulaton ang opisyal nga all-clear.", filipino: "Update: wala na akong nakikitang apoy mula sa ligtas na lugar. Hinihintay ang opisyal na all-clear.", english: "Update: I can no longer see flames from a safe distance. We are waiting for an official all-clear." }, severity: "Critical",
  },
  Flooding: {
    topic: { cebuano: "baha", filipino: "baha", english: "floodwater" },
    observation: { cebuano: "Nisaka ang tubig human sa ulan ug natabonan ang kilid sa dalan. Wala ko mosulay og tabok kay dili makita ang kanal. Lisod na ang agian sa gagmay nga motor.", filipino: "Tumaas ang tubig matapos ang ulan at natakpan ang gilid ng daan. Hindi ako tumawid dahil hindi kita ang kanal. Nahihirapan nang dumaan ang maliliit na motor.", english: "Water rose after the rain and covered the road edge. I did not cross because the drainage channel was hidden. Small motorcycles were having difficulty passing." },
    question: { cebuano: "Makaya pa sa multicab o mas maayo mangita og laing agianan?", filipino: "Kaya pa ba ng multicab o mas mabuting maghanap ng ibang daan?", english: "Is there a safe alternative route rather than trying to cross?" },
    advice: { cebuano: "Dili ta makasiguro sa giladmon pinaagi sa litrato. Ayaw pugsa og tabok.", filipino: "Hindi masisiguro ang lalim sa litrato. Huwag piliting tumawid.", english: "A photo cannot establish the depth. Please do not force a crossing." },
    followup: { cebuano: "Update: nihubas na ang tubig, pero lapok pa ang daplin. Mag-amping gihapon.", filipino: "Update: humupa na ang tubig pero maputik pa ang gilid. Mag-ingat pa rin.", english: "Update: the water has receded but the road edge is still muddy. Please remain careful." }, severity: "High",
  },
  "Streetlight Outage": {
    topic: { cebuano: "palong nga suga", filipino: "patay na streetlight", english: "unlit streetlight" },
    observation: { cebuano: "Duha na ka gabii nga dili mosiga ang poste duol sa agianan. Ngitngit inig-uli gikan trabaho. Basin mapatan-aw, ilabi na kay naay mga estudyante nga moagi.", filipino: "Dalawang gabi nang hindi umiilaw ang poste malapit sa daanan. Madilim pauwi galing trabaho. Sana matingnan dahil may mga estudyanteng dumadaan.", english: "The light near the footpath has been out for two evenings. It is dark walking home from work. Could it be checked, especially as students use this path?" },
    question: { cebuano: "Ang poste tapad sa gamay nga tindahan imong pasabot?", filipino: "Iyong poste po ba sa tabi ng maliit na tindahan?", english: "Do you mean the pole beside the small shop?" },
    advice: { cebuano: "Ayaw hikapa ang wiring. Ireport ang poste sa maintenance kon luwas makita ang numero.", filipino: "Huwag hawakan ang wiring. Ibigay sa maintenance ang pole number kung ligtas itong basahin.", english: "Do not touch the wiring. Give maintenance the pole number if it can be read safely." },
    followup: { cebuano: "Update: misiga na paglabay nako kagabii. Salamat sa nitabang og follow-up.", filipino: "Update: umiilaw na nang dumaan ako kagabi. Salamat sa nag-follow up.", english: "Update: the light was working when I passed last night. Thanks to everyone who followed up." }, severity: "Low",
  },
  "Suspicious Person": {
    topic: { cebuano: "wala mailhing bisita", filipino: "hindi kilalang bisita", english: "unfamiliar visitor" },
    observation: { cebuano: "Naay wala nako mailhi nga nangutana kon kinsa ang naa sa balay. Wala siyay hulga ug milakaw ra. Basin delivery ra, pero wala mi gipaabot. Observation lang ni, dili akusasyon.", filipino: "May hindi ko kilalang nagtanong kung sino ang nasa bahay. Hindi siya nanakot at umalis din. Baka delivery lang pero wala kaming inaasahan. Obserbasyon ito, hindi akusasyon.", english: "An unfamiliar visitor asked who was home, made no threats and left. It may have been a delivery, though we were not expecting one. This is an observation, not an accusation." },
    question: { cebuano: "Nisulti ba siya unsang delivery o kinsay gipangita?", filipino: "Nabanggit ba kung anong delivery o sino ang hinahanap?", english: "Did they mention a delivery or the person they were looking for?" },
    advice: { cebuano: "Dili krimen ang dili nato kaila. Ayaw pag-post og nawong o personal nga detalye.", filipino: "Hindi krimen ang pagiging hindi kilala. Huwag mag-post ng mukha o personal na detalye.", english: "Being unfamiliar is not a crime. Please do not post a face or personal details." },
    followup: { cebuano: "Update: delivery diay nga nasayop og balay. Naklaro na, walay nahitabong krimen.", filipino: "Update: delivery pala sa maling bahay. Malinaw na at walang naganap na krimen.", english: "Update: it was a delivery to the wrong house. This was clarified and no crime occurred." }, severity: "Low",
  },
  "Suspicious Vehicle": {
    topic: { cebuano: "nakaparada nga van", filipino: "nakaparadang van", english: "parked van" },
    observation: { cebuano: "Naay van nga dugay nakaparada sa daplin. Wala koy nakita nga illegal nga gibuhat. Nangutana lang ko kon naay delivery diri aron dili ta magpataka og hunahuna.", filipino: "May van na matagal nakaparada sa gilid. Wala akong nakitang ilegal na ginawa. Nagtatanong lang kung may delivery rito para hindi tayo manghula.", english: "A van was parked at the roadside for a while. I saw no illegal activity. I am asking whether a delivery was expected rather than jumping to conclusions." },
    question: { cebuano: "Naa bay delivery nga gipaabot sa mga tindahan?", filipino: "May inaasahan bang delivery ang mga tindahan?", english: "Are any of the shops expecting a delivery?" },
    advice: { cebuano: "Ang pagparada lang dili ebidensya sa krimen. Ayaw komprontaha o ibutang ang plaka diri.", filipino: "Hindi ebidensya ng krimen ang pagparada lang. Huwag komprontahin o ilagay ang plaka rito.", english: "Parking alone is not evidence of a crime. Do not confront anyone or publish plate details here." },
    followup: { cebuano: "Update: gi-confirm sa tindahan nga ilang supplier ang van. Naklaro na.", filipino: "Update: kinumpirma ng tindahan na supplier nila ang van. Malinaw na.", english: "Update: the shop confirmed that the van belonged to its supplier. The concern was clarified." }, severity: "Low",
  },
  "Online Scam / Suspicious Message": {
    topic: { cebuano: "kadudahang mensahe", filipino: "kahina-hinalang mensahe", english: "suspicious message" },
    observation: { cebuano: "Nakadawat kog text nga kuno ma-lock akong account ug kinahanglan pindoton ang link. Wala nako giablihan. Wala koy na-transfer nga kwarta. Basin makatabang nga pahimangno sa uban.", filipino: "Nakatanggap ako ng text na malo-lock daw ang account at kailangang pindutin ang link. Hindi ko binuksan at wala akong ipinadalang pera. Paalala lang sa iba.", english: "I received a text claiming my account would be locked unless I followed a link. I did not open it or send money. Sharing this as a reminder to check through official channels." },
    question: { cebuano: "Naa pud moy nadawat nga pareho nga text? Ayaw lang i-share ang link.", filipino: "May nakatanggap din ba ng ganitong text? Huwag ibahagi ang link.", english: "Has anyone received a similar text? Please do not repost the link." },
    advice: { cebuano: "Ayaw ihatag ang OTP o password. Gamita ang opisyal nga app sa pag-check.", filipino: "Huwag ibigay ang OTP o password. Mag-check sa opisyal na app.", english: "Never share an OTP or password. Check using the official app instead." },
    followup: { cebuano: "Update: na-block ug na-report na ang mensahe. Wala gihapoy kwarta nga gipadala.", filipino: "Update: na-block at nai-report na ang mensahe. Walang perang ipinadala.", english: "Update: the message has been blocked and reported. No money was sent." }, severity: "Medium",
  },
  "Lost Item": {
    topic: { cebuano: "nawalang pitaka", filipino: "nawalang pitaka", english: "lost wallet" },
    observation: { cebuano: "Wala na akong pitaka pag-abot sa balay. Basin natagak sa akong gilakwan, wala ko kakita nga naay mikuha. Kon naay nakakita, i-turn over lang sa barangay ug ako mismo mo-describe sa sulod.", filipino: "Wala na ang pitaka ko pag-uwi. Baka nahulog sa dinaanan, wala akong nakitang kumuha. Kung may nakakita, pakibigay sa barangay at ako ang maglalarawan ng laman.", english: "I noticed my wallet was missing after getting home. It may have fallen along my walk, and I did not see anyone take it. Please hand it to the barangay if found so I can privately describe its contents." },
    question: { cebuano: "Unsang agianan imong naagian? Ayaw ipakita ang ID diri.", filipino: "Aling daan po ang dinaanan ninyo? Huwag ilagay ang ID rito.", english: "Which route did you take? Please do not post an ID here." },
    advice: { cebuano: "Ang nakakita, ayaw i-post ang litrato sa IDs. I-turn over sa barangay.", filipino: "Kung may nakakita, huwag ipost ang mga ID. Ibigay sa barangay.", english: "If found, do not post photographs of IDs. Hand the wallet to the barangay." },
    followup: { cebuano: "Update: nabalik na ang pitaka human nako ma-describe ang sulod. Salamat kaayo sa nakakita.", filipino: "Update: naibalik na ang pitaka matapos kong ilarawan ang laman. Maraming salamat sa nakakita.", english: "Update: the wallet was returned after I described its contents. Many thanks to the finder." }, severity: "Low",
  },
  "General Safety Concern": {
    topic: { cebuano: "naguba nga tabon sa kanal", filipino: "sirang takip ng kanal", english: "damaged drain cover" },
    observation: { cebuano: "Naay liki nga tabon sa kanal nga matamakan sa naglakaw. Nakita nako nga molihok kon maagian. Wala koy nakita nga nasamdan, pero basin ma-check sa maintenance sa dili pa naay matumba.", filipino: "May bitak ang takip ng kanal sa dinaraanan. Gumagalaw kapag natatapakan. Wala akong nakitang nasaktan, pero sana matingnan ng maintenance bago may madapa.", english: "A cracked drain cover on the footpath shifts when stepped on. I have not seen an injury, but it would help to have maintenance check it before someone trips." },
    question: { cebuano: "Naa ba ni sa daplin sa pedestrian nga agianan?", filipino: "Nasa gilid po ba ito ng dinaraanan ng pedestrian?", english: "Is it beside the pedestrian path?" },
    advice: { cebuano: "Ayaw tukma o sulayi ang tabon. Likayi lang ug ipahibalo ang tukmang lugar sa maintenance.", filipino: "Huwag tapakan para subukan. Iwasan at ibigay sa maintenance ang eksaktong lokasyon.", english: "Do not step on it to test it. Avoid it and give maintenance the precise location." },
    followup: { cebuano: "Update: nailisan na ang tabon. Luwas na ang agianan sa akong pag-check.", filipino: "Update: napalitan na ang takip. Maayos na ang daan nang tingnan ko.", english: "Update: the cover has been replaced and the path was clear when I checked." }, severity: "Medium",
  },
};

const languageAt = (seed: number): FixtureLanguage => {
  const value = ((seed * 2654435761) >>> 0) % 10;
  return value < 6 ? "cebuano" : value < 8 ? "filipino" : "english";
};
const landmarks: Translated[] = [
  { cebuano: "duol sa gamay nga tindahan", filipino: "malapit sa maliit na tindahan", english: "near a small shop" },
  { cebuano: "sa may waiting shed", filipino: "sa may waiting shed", english: "by the waiting shed" },
  { cebuano: "sa kilid sa kurbada", filipino: "sa gilid ng kurbada", english: "beside the bend" },
  { cebuano: "duol sa agianan padulong sa mga balay", filipino: "malapit sa daan papunta sa mga bahay", english: "near the path leading to the houses" },
];
const times: Translated[] = [
  { cebuano: "ganihang buntag", filipino: "kaninang umaga", english: "earlier this morning" },
  { cebuano: "kagahapong hapon", filipino: "kahapon ng hapon", english: "yesterday afternoon" },
  { cebuano: "kagabii", filipino: "kagabi", english: "last night" },
  { cebuano: "ganihang hapon", filipino: "kaninang hapon", english: "earlier this afternoon" },
];

export function reportNarrative(index: number, type: string, barangay: string, status: string) {
  const scenario = scenarios[type];
  if (!scenario) throw new Error(`Missing narrative for ${type}`);
  const language = languageAt(index);
  const landmark = landmarks[Math.floor(index / 7) % landmarks.length]![language];
  const time = times[Math.floor(index / 11) % times.length]![language];
  const notice: Translated = { cebuano: "Dili ni tinuod nga hitabo.", filipino: "Hindi ito totoong pangyayari.", english: "This is not a real incident." };
  let label: Label = ["Suspicious Person", "Suspicious Vehicle", "Online Scam / Suspicious Message"].includes(type) ? "neutral" : "negative";
  let update = "";
  if (status === "Resolved") {
    update = scenario.followup[language];
    label = ["Lost Item", "Streetlight Outage", "General Safety Concern"].includes(type) ? "positive" : "mixed";
  } else if (status === "Rejected" || status === "Marked Fake") {
    update = ({ cebuano: "Review update: wala kini makumpirma. Ayaw kini ipaambit isip tinuod nga hitabo.", filipino: "Review update: hindi ito nakumpirma. Huwag ibahagi bilang totoong pangyayari.", english: "Review update: this was not confirmed. Do not share it as a real event." } as Translated)[language];
  }
  return {
    text: `Sample report: [SIMULATED #${index}] ${barangay}, ${landmark}, ${time}. ${scenario.observation[language]} ${update || notice[language]}`,
    language, label, severity: scenario.severity,
  };
}

export function commentNarrative(reportIndex: number, type: string, barangay: string, position: number, status: string) {
  const scenario = scenarios[type]!;
  const language = languageAt(reportIndex * 7 + position * 3);
  const topic = scenario.topic[language];
  const acknowledgements: Translated[] = [
    { cebuano: "Salamat sa klarong update. Mas maayo gyud nga naay follow-up.", filipino: "Salamat sa malinaw na update. Mabuti at may follow-up.", english: "Thanks for the clear update. It helps to hear the follow-up." },
    { cebuano: "Sakto nga wala sa ta mag-assume. Hulaton nato ang kumpirmadong detalye.", filipino: "Tama na huwag munang mag-assume. Hintayin ang kumpirmadong detalye.", english: "Agreed, best not to assume. Let us wait for confirmed details." },
    { cebuano: "Salamat sa update!", filipino: "Salamat sa update!", english: "Thanks for the update!" },
    { cebuano: "Sige, maghulat sa ko.", filipino: "Sige po, maghihintay muna ako.", english: "Okay, I will wait for an update." },
  ];
  let label: Label = "neutral";
  let text: string;
  switch (position) {
    case 0: text = scenario.question[language]; break;
    case 1: text = scenario.advice[language]; break;
    case 2:
      text = ({ cebuano: `Nakaagi ko sa ${barangay}, pero wala nako makita ang tibuok bahin sa ${topic}. Dili nako ma-confirm ang tanan.`, filipino: `Dumaan ako sa ${barangay} pero hindi ko nakita ang buong pangyayari sa ${topic}. Hindi ko makumpirma ang lahat.`, english: `I passed through ${barangay}, but did not see the whole situation with the ${topic}. I cannot confirm every detail.` } as Translated)[language];
      break;
    case 3:
      text = status === "Resolved" ? scenario.followup[language] : ({ cebuano: `Update sa ${topic}: nangutana na mi sa barangay. Wala pa mi nadawat nga kumpirmadong resulta.`, filipino: `Update sa ${topic}: nakapagtanong na kami sa barangay. Wala pang kumpirmadong resulta.`, english: `Update on the ${topic}: we have asked the barangay. There is no confirmed outcome yet.` } as Translated)[language];
      label = status === "Resolved" ? "positive" : "neutral";
      break;
    case 4:
      text = ({ cebuano: `Nabalaka ko aning ${topic}. Unta ma-check dayon, pero ayaw sa ta pagpakalat og wala makumpirma.`, filipino: `Nag-aalala ako tungkol sa ${topic}. Sana matingnan agad, pero huwag magkalat ng hindi kumpirmado.`, english: `I am worried about the ${topic}. I hope it is checked soon, without spreading unconfirmed claims.` } as Translated)[language];
      label = "negative";
      break;
    case 5:
      text = acknowledgements[Math.floor(reportIndex / 3) % acknowledgements.length]![language];
      label = "positive";
      break;
    case 6:
      text = ({ cebuano: `Unsang orasa nimo na-check ang ${topic}? Basin lahi na ang kahimtang karon.`, filipino: `Anong oras po ninyo huling nakita ang ${topic}? Baka iba na ang kalagayan ngayon.`, english: `When did you last check the ${topic}? The situation might have changed since then.` } as Translated)[language];
      break;
    case 7:
      text = ({ cebuano: "Nag-message ko sa akong pamilya nga mag-check una sa update sa dili pa moagi.", filipino: "Nag-message ako sa pamilya na tingnan muna ang update bago dumaan.", english: "I have asked my family to check for an update before passing through." } as Translated)[language];
      break;
    case 8:
      text = ({ cebuano: "Clarification lang: ang akong gi-share kay akong nakita ra, dili opisyal nga findings. Mubo ra akong paglabay, wala ko nagpabilin didto. Basin naay laing detalye nga wala nako makita, mao nga dili nako makumpirma ang tibuok report.", filipino: "Linawin ko lang: sariling obserbasyon ang ibinahagi ko, hindi opisyal na findings. Sandali lang akong dumaan at hindi ako nanatili roon. Maaaring may detalyeng hindi ko nakita, kaya hindi ko makumpirma ang buong report.", english: "Just to clarify, I shared a personal observation, not official findings. I only passed briefly and did not stay. There may be details I missed, so please do not treat my comment as confirmation of the entire report." } as Translated)[language];
      break;
    case 9:
      text = ({ cebuano: "Dili nato i-forward ang screenshot nga walay petsa. Basin karaan ang update.", filipino: "Huwag i-forward ang screenshot na walang petsa. Baka lumang update iyon.", english: "Please do not forward undated screenshots. They may refer to an older update." } as Translated)[language];
      break;
    case 10:
      text = ({ cebuano: `Naa pa bay bag-ong balita sa ${barangay}? Wala ko sa lugar karon.`, filipino: `May bago na bang balita sa ${barangay}? Wala ako roon ngayon.`, english: `Any newer information from ${barangay}? I am not there at the moment.` } as Translated)[language];
      break;
    default:
      text = ({ cebuano: "Salamat sa pagtul-id sa detalye. Mas klaro na karon kaysa sa unang nadungog nako.", filipino: "Salamat sa paglilinaw. Mas malinaw na ngayon kaysa sa una kong narinig.", english: "Thanks for clearing that up. This is clearer than what I first heard." } as Translated)[language];
      label = "positive";
  }
  return { text: `Sample comment: [SIMULATED] ${text}`, language, label };
}
