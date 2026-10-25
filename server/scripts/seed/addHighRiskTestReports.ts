/** Additional fictional high-risk scenarios for the owner's private test database. */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { buildSampleModel, SEED_POSTERS } from "./sampleData.js";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const scenarios = [
  { type: "Fire Incident", text: [
    "Nakita nako ang siga nga mikatag gikan sa kusina ngadto sa atop sa balay. Naay duha ka residente nga naghulat og tabang sa bintana sa ikaduhang andana. Nipalayo mi sa silingan ug nitawag sa bombero. Wala pa nako makita nga nakagawas silang duha.",
    "May apoy na kumakalat mula sa kusina hanggang bubong. Dalawang residente ang humihingi ng tulong sa bintana sa ikalawang palapag. Lumayo kami at tumawag sa bumbero. Hindi ko pa nakikitang nakalabas ang dalawa.",
    "Flames are spreading from the kitchen into the roof. Two residents are calling for help from an upstairs window. We moved away and called the fire service. I have not yet seen either resident get out.",
  ] },
  { type: "Vehicular Accident", text: [
    "Nakita nako ang motor nga nabangga sa van sa kurbada. Ang rider naghigda sa dalan, adunay dugo sa tiil ug dili makatindog. Ang akong kauban nitawag og ambulansya samtang gipalayo namo ang mga sakyanan. Wala namo ibalhin ang rider ug wala ko kahibalo sa hinungdan sa bangga.",
    "Nakita kong nagbanggaan ang motor at van sa kurbada. Nasa kalsada ang rider, may dugo sa binti at hindi makatayo. Tumawag ng ambulansya ang kasama ko habang inilalayo namin ang mga sasakyan. Hindi namin ginalaw ang rider at hindi ko alam ang sanhi ng banggaan.",
    "I saw a motorcycle collide with a van at the bend. The rider is lying in the road with a bleeding leg and cannot stand. My companion called an ambulance while we kept vehicles away. We have not moved the rider and I do not know what caused the collision.",
  ] },
  { type: "Flooding", text: [
    "Paspas nga misaka ang tubig human sa kusog nga ulan. Naay pamilya nga adunay gamay nga bata nga naipit sa balay, ug kusog ang sulog sa ilang pultahan. Nitawag mi sa barangay aron mangayo og rescue. Wala mi misulay pagtabok kay dili makita ang kanal ug ang giladmon.",
    "Mabilis tumaas ang baha matapos ang malakas na ulan. May pamilyang may maliit na bata na hindi makalabas sa bahay dahil malakas ang agos sa pintuan. Tumawag kami sa barangay para humingi ng rescue. Hindi kami tumawid dahil hindi kita ang kanal at lalim.",
    "Floodwater rose rapidly after heavy rain. A family with a young child cannot leave their house because a strong current is passing the doorway. We called the barangay for rescue assistance. We have not tried to cross because the drain and water depth are hidden.",
  ] },
  { type: "General Safety Concern", text: [
    "Nakita nako ang naputol nga kable sa kuryente nga nagbitay sa dalan, adunay aligato duol sa basa nga semento. Naay mga tawo nga hapit moduol. Gipasidan-an namo sila nga mopahilayo ug gitawagan ang barangay ug electric utility. Wala namo hilabti ang kable.",
    "May naputol na kable ng kuryente sa daan at may mga spark malapit sa basang semento. May mga taong papalapit kaya pinakiusapan naming lumayo. Tinawagan namin ang barangay at electric utility. Hindi namin hinawakan ang kable.",
    "A fallen electrical cable is sparking close to wet pavement on the road. Several pedestrians were about to approach it. We asked them to stay away and contacted the barangay and electric utility. Nobody with us has touched the cable.",
  ] },
];

async function main() {
  const emails = Array.from({ length: SEED_POSTERS }, (_, i) => `poster${i + 1}@communishield.local`);
  const accounts = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email && emails.includes(u.email)) accounts.set(u.email, u.id);
    if (data.users.length < 1000) break;
  }
  if (accounts.size !== SEED_POSTERS) throw new Error("Missing existing poster accounts.");
  const { data: profiles, error: profileError } = await db.from("profiles")
    .select("id,user_name,fullname,role,status").in("id", [...accounts.values()]);
  if (profileError) throw profileError;
  const profileMap = new Map((profiles || []).map(p => [p.id, p]));
  const { data: types, error: typeError } = await db.from("incident_types").select("id,name");
  if (typeError) throw typeError;
  const typeMap = new Map((types || []).map(t => [t.name, t.id]));
  const coordinates = buildSampleModel().coordinates;
  const now = Date.now();
  const rows = Array.from({ length: 120 }, (_, i) => {
    const scenario = scenarios[i % scenarios.length]!;
    const location = coordinates[i % coordinates.length]!;
    const userId = accounts.get(emails[i % emails.length]!)!;
    const profile = profileMap.get(userId);
    if (!profile || profile.role !== "user" || profile.status !== "Active") throw new Error("Inactive poster profile.");
    const typeId = typeMap.get(scenario.type);
    if (!typeId) throw new Error(`Missing incident type ${scenario.type}`);
    const created = new Date(now - (i % 21) * 86400000 - (i * 17 + 20) * 60000).toISOString();
    const time = new Date(created).toLocaleString("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" });
    return {
      id: `7e571022-0000-4000-8001-${String(641 + i).padStart(12, "0")}`,
      user_id: userId, incident_type_id: typeId,
      location: `${location.barangay}, Argao, Cebu`, latitude: location.latitude, longitude: location.longitude,
      poster_name: profile.user_name || profile.fullname, display_name_type: "Username",
      details: `${location.barangay}, ${time}. ${scenario.text[Math.floor(i / 4) % 3]}`,
      status: "Pending Review", created_at: created, updated_at: created,
    };
  });
  const { data: existing, error } = await db.from("reports").select("id").in("id", rows.map(r => r.id));
  if (error) throw error;
  const ids = new Set((existing || []).map(r => r.id));
  const pending = rows.filter(r => !ids.has(r.id));
  if (process.argv.includes("--apply") && pending.length) {
    const { error: insertError } = await db.from("reports").insert(pending);
    if (insertError) throw insertError;
  }
  console.log(`${process.argv.includes("--apply") ? "Inserted" : "Would insert"} ${pending.length} additional high-risk scenario reports (${ids.size} already present).`);
  console.log("Severity and credibility are intentionally left to the real AI analysis service.");
}
main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
