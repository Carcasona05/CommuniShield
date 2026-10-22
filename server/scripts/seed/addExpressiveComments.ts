/** Fictional, authored conversation content for the private testing app only.
 * No training data or model changes. No generated sentiment labels are persisted.
 * Preview: node --import tsx scripts/seed/addExpressiveComments.ts
 * Insert + local inference: node --import tsx scripts/seed/addExpressiveComments.ts --apply
 * Rerun safely to finish missing inserts and retry unsuccessful local analyses.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { supabaseAdmin as db } from "../../src/config/supabaseAdmin.js";
import { sentimentService } from "../../src/services/sentimentService.js";

const COUNT = 3000;
const APPLY = process.argv.includes("--apply");
type Language = "cebuano" | "filipino" | "english";
type Tone = "positive" | "negative";
const words: Record<Language, Record<Tone, string[]>> = {
  cebuano: {
    positive: ["Salamat", "Maayo", "Nindot", "Buotan", "Mapasalamaton", "Bilib", "Malipayon", "Maayohon", "Maalamon", "Madasigon"],
    negative: ["Makahadlok", "Delikado", "Makaguol", "Makalagot", "Nabalaka", "Nasuko", "Makasubo", "Masakit", "Kahadlok", "Kasubo"],
  },
  filipino: {
    positive: ["Salamat", "Magaling", "Mahusay", "Mabait", "Napakabuti", "Kahanga-hanga", "Masaya", "Maganda", "Galing", "Panalo"],
    negative: ["Nakakatakot", "Delikado", "Nakakagalit", "Nakakabahala", "Nakakalungkot", "Masakit", "Nakakainis", "Nababahala", "Nakakadismaya", "Malungkot"],
  },
  english: {
    positive: ["Thanks", "Excellent", "Wonderful", "Brilliant", "Helpful", "Amazing", "Grateful", "Appreciated", "Awesome", "Fantastic"],
    negative: ["Terrifying", "Dangerous", "Upsetting", "Alarming", "Heartbreaking", "Infuriating", "Distressing", "Worrying", "Horrible", "Frightening"],
  },
};
// Reactions, not invented claims of responders arriving or incidents being verified.
const beginnings: Record<Language, Record<Tone, string[]>> = {
  cebuano: {
    positive: ["Daghang salamat sa pagpaabot niini.", "Maayo kaayo nga imong gipahibalo ang komunidad.", "Bilib ko sa imong pag-amping sa uban.", "Nindot nga klaro imong paghulagway.", "Dako kaayong tabang ang imong report.", "Salamat gyud sa imong pagpakabana.", "Maayo nga wala ka nagpataka og pasangil.", "Mapasalamaton ko nga imong gi-share ang imong nakita.", "Nindot kaayo ang imong responsableng pagpahibalo.", "Buotan kaayo ka sa paghunahuna sa kaluwasan sa uban."],
    negative: ["Nabalaka gyud ko sa akong nabasa.", "Makahadlok kaayo hunahunaon ang posibleng mahitabo.", "Makaguol kaayo kon adunay maangin niini.", "Makasubo nga adunay ingon ani nga problema.", "Delikado gyud kon dili dayon mabantayan.", "Makalagot kon pasagdan ra ang ingon ani.", "Nahadlok ko para sa mga tawo nga maagian niini.", "Dili gyud lalim ang kabalaka nga dala niini.", "Sakit kaayo hunahunaon nga adunay mahimong masamdan.", "Nabalaka ko labi na para sa mga bata ug tigulang."],
  },
  filipino: {
    positive: ["Maraming salamat sa pagbabahagi nito.", "Napakabuti na ipinaalam mo ito sa komunidad.", "Malaking tulong ang malinaw mong ulat.", "Kahanga-hanga ang malasakit mo sa iba.", "Salamat sa pagiging maingat sa mga detalye.", "Magaling na hindi ka nagbintang nang walang ebidensya.", "Pinahahalagahan ko ang responsableng pag-uulat mo.", "Mabuti na iniisip mo ang kaligtasan ng lahat.", "Nakakatuwa ang pagmamalasakit mo sa mga kapitbahay.", "Salamat talaga sa oras na inilaan mo rito."],
    negative: ["Nakakabahala talaga ang nabasa ko.", "Nakakatakot isipin kung may madamay rito.", "Nalulungkot ako para sa mga maaaring maapektuhan.", "Nakakagalit kung mapapabayaan lang ito.", "Delikado kung hindi ito mapapansin agad.", "Nakakabigat ng loob ang ganitong problema.", "Nag-aalala ako lalo na para sa mga bata.", "Masakit isipin na may posibleng masaktan.", "Nakakadismaya na may ganitong panganib.", "Natatakot ako para sa matatandang dumaraan."],
  },
  english: {
    positive: ["Thank you for taking the time to report this.", "I really appreciate your concern for the community.", "Your clear description is very helpful.", "Excellent job sharing what you actually observed.", "I am grateful that you are looking out for others.", "It is wonderful to see such thoughtful reporting.", "Thank you for being careful with the details.", "Your effort to keep neighbours informed is appreciated.", "I admire the care you have shown for other people.", "This is a helpful and responsible way to raise a concern."],
    negative: ["I am really worried after reading this.", "It is frightening to think someone could be hurt.", "This situation sounds deeply upsetting.", "I am angry at the thought of this being ignored.", "It is heartbreaking to think about people being affected.", "This possible danger is genuinely alarming.", "I feel anxious for the children who might be nearby.", "It is distressing to read about a concern like this.", "The risk to older residents really worries me.", "I would be frightened to encounter this myself."],
  },
};
const endings: Record<Language, Record<Tone, string[]>> = {
  cebuano: {
    positive: ["Salamat sa pag-una sa kaluwasan.", "Dako gyud akong pasalamat.", "Padayon sa maayong pagpakabana.", "Maayo kaayo nga adunay motingog.", "Nindot ang imong pagtinabangay.", "Salamat sa klarong impormasyon."],
    negative: ["Lisod kaayo kini para sa mga residente.", "Dili gyud ko komportable ani nga risgo.", "Unta walay madugangan nga kadaot.", "Nabalaka gyud ko sa kahimtang.", "Dili ni angay pasagdan.", "Makasubo gyud kon adunay maangin."],
  },
  filipino: {
    positive: ["Salamat sa pag-una sa kaligtasan.", "Malaki ang pasasalamat ko.", "Ipagpatuloy ang mabuting malasakit.", "Mabuti at may nagsasalita tungkol dito.", "Napakahalaga ng iyong pagtulong.", "Salamat sa malinaw na impormasyon."],
    negative: ["Mahirap ito para sa mga residente.", "Hindi ako mapakali sa ganitong panganib.", "Sana walang madagdag na pinsala.", "Talagang nag-aalala ako rito.", "Hindi ito dapat pabayaan.", "Masakit kung may madadamay."],
  },
  english: {
    positive: ["Thank you for putting safety first.", "I am genuinely grateful.", "Your kindness matters.", "It is good that someone spoke up.", "I appreciate this helpful effort.", "Thanks for keeping the details clear."],
    negative: ["This would be very difficult for residents.", "I am not comfortable with that risk.", "I hope nobody suffers further harm.", "This leaves me genuinely concerned.", "It should not be neglected.", "It would be awful if someone were affected."],
  },
};

function commentText(index: number, type: string, barangay: string) {
  const tone: Tone = (index + Math.floor(index / 760)) % 2 ? "negative" : "positive";
  const block = Math.floor(index / 10);
  const language: Language = block % 5 < 3 ? "cebuano" : block % 5 === 3 ? "filipino" : "english";
  if (index % 10 < 2) {
    const list = words[language][tone];
    return { text: list[Math.floor(block / 5) % list.length]!, tone, language, oneWord: true };
  }
  const a = beginnings[language][tone];
  const b = endings[language][tone];
  const topic = language === "cebuano" ? `Kini nga report sa ${barangay} bahin sa ${type.toLowerCase()}`
    : language === "filipino" ? `Ang ulat sa ${barangay} tungkol sa ${type.toLowerCase()}`
      : `This ${type.toLowerCase()} report from ${barangay}`;
  const bridge = language === "cebuano"
    ? tone === "positive" ? `${topic} makatabang sa among pag-amping.` : `${topic} nakapadugang sa akong kabalaka.`
    : language === "filipino"
      ? tone === "positive" ? `${topic} ay nakakatulong sa aming pag-iingat.` : `${topic} ay nakadagdag sa pag-aalala ko.`
      : tone === "positive" ? `${topic} helps us stay informed and careful.` : `${topic} adds to my concern about safety.`;
  return { text: `${a[Math.floor(index / 2) % a.length]} ${bridge} ${b[Math.floor(index / 20) % b.length]}`, tone, language, oneWord: false };
}

async function main() {
  const { data: reports, error: reportError } = await db.from("reports")
    .select("id,location,created_at,incident_types(name)")
    .gte("id", "7e571022-0000-4000-8001-000000000001")
    .lte("id", "7e571022-0000-4000-8001-000000000760").order("id").limit(1000);
  if (reportError) throw reportError;
  if (reports?.length !== 760) throw new Error(`Expected 760 test posts, found ${reports?.length || 0}. No inserts performed.`);
  const emails = Array.from({ length: 15 }, (_, i) => `commenter${i + 1}@communishield.local`);
  const accounts = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email && emails.includes(u.email)) accounts.set(u.email, u.id);
    if (data.users.length < 1000) break;
  }
  if (accounts.size !== emails.length) throw new Error("Missing existing commenter accounts.");
  const { data: profiles, error: profileError } = await db.from("profiles").select("id,role,status").in("id", [...accounts.values()]);
  if (profileError) throw profileError;
  if (profiles?.length !== 15 || profiles.some(p => p.role !== "user" || p.status !== "Active")) throw new Error("Commenter profiles must all be active users.");
  const now = Date.now();
  const intended = { positive: 0, negative: 0, oneWord: 0 };
  const rows = Array.from({ length: COUNT }, (_, i) => {
    const report = reports[i % reports.length]!;
    const type = report.incident_types as unknown as { name: string };
    const text = commentText(i, type.name, report.location.split(",")[0]);
    intended[text.tone]++;
    if (text.oneWord) intended.oneWord++;
    if (/\bsample\b|\bsimulated\b/i.test(text.text)) throw new Error("Testing label in comment.");
    return {
      id: `7e571022-0000-4000-8003-${String(i + 1).padStart(12, "0")}`,
      report_id: report.id, user_id: accounts.get(emails[i % emails.length]!)!, content: text.text,
      created_at: new Date(Math.max(now - (COUNT - i) * 1000, Date.parse(report.created_at) + 1000)).toISOString(),
    };
  });
  console.log(`Prepared ${rows.length} comments across ${new Set(rows.map(r => r.report_id)).size} posts. Intended tones (not model results): ${JSON.stringify(intended)}`);
  console.log("Preview:", rows.slice(0, 4).map(r => r.content));
  if (!APPLY) { console.log("Preview only. Use --apply to insert and analyze locally."); return; }
  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100);
    const { data, error } = await db.from("report_comments").select("id").in("id", batch.map(r => r.id));
    if (error) throw error;
    const existing = new Set((data || []).map(r => r.id));
    const pending = batch.filter(r => !existing.has(r.id));
    if (pending.length) {
      const { error: insertError } = await db.from("report_comments").insert(pending);
      if (insertError) throw insertError;
      inserted += pending.length;
    }
  }
  const { count: verified, error: verifyError } = await db.from("report_comments")
    .select("id", { count: "exact", head: true })
    .gte("id", rows[0]!.id).lte("id", rows[rows.length - 1]!.id);
  if (verifyError) throw verifyError;
  if (verified !== COUNT) throw new Error(`Expected ${COUNT} stored comments, found ${verified}.`);
  console.log(`Inserted ${inserted} comments; ${COUNT - inserted} already present. Verified ${verified} stored comments.`);
  if (process.argv.includes("--insert-only")) return;
  console.log("Starting local-only sentiment analysis.");
  const stored = new Map<string, { status: string; provider: string; label: string }>();
  for (let offset = 0; offset < rows.length; offset += 100) {
    const { data, error } = await db.from("sentiment_analysis").select("subject_id,status,provider,label")
      .eq("subject_type", "comment").in("subject_id", rows.slice(offset, offset + 100).map(r => r.id));
    if (error) throw error;
    for (const r of data || []) stored.set(r.subject_id, r);
  }
  const pending = rows.filter(r => stored.get(r.id)?.status !== "succeeded" || stored.get(r.id)?.provider !== "local");
  const directory = fileURLToPath(new URL("../../../artifacts/expressive-comments/", import.meta.url));
  mkdirSync(directory, { recursive: true });
  const progress = {
    total: COUNT, inserted, alreadyPresent: COUNT - inserted, intended,
    succeeded: COUNT - pending.length, failed: 0, updatedAt: "",
    labels: {} as Record<string, number>, errors: [] as Array<{ id: string; error: string }>,
  };
  for (const row of rows) {
    const previous = stored.get(row.id);
    if (previous?.status === "succeeded" && previous.provider === "local") progress.labels[previous.label] = (progress.labels[previous.label] || 0) + 1;
  }
  function save() {
    progress.updatedAt = new Date().toISOString();
    writeFileSync(`${directory}/progress.json`, JSON.stringify(progress, null, 2));
  }
  save();
  let index = 0;
  async function worker() {
    while (index < pending.length) {
      const row = pending[index++]!;
      try {
        const result = await sentimentService.analyze("comment", row.id, { force: true, localOnly: true });
        if (result.status !== "succeeded" || result.provider !== "local") throw new Error(`${result.status}: ${result.error_code || result.provider}`);
        progress.succeeded++;
        progress.labels[result.label] = (progress.labels[result.label] || 0) + 1;
      } catch (error) {
        progress.failed++;
        progress.errors.push({ id: row.id, error: error instanceof Error ? error.message : String(error) });
      }
      save();
      if ((progress.succeeded + progress.failed) % 100 === 0) console.log(JSON.stringify(progress));
    }
  }
  await Promise.all([worker(), worker()]);
  console.log(JSON.stringify(progress));
}
main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
