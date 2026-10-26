import { BLOTTER_FORM_SECTIONS, getBlotterFormValues, validateBlotterForm } from "./blotterForm.js";

const STORAGE_KEY = "communishield.localBlotters.v1";
const fields = BLOTTER_FORM_SECTIONS.flatMap((section) => section.fields);

// One shared instance is used by both admin screens. Serialize writes so saving
// two entries at once cannot allocate the same number or overwrite an entry.
export const createLocalBlotterStore = (storage) => {
  let pending = Promise.resolve();
  const serialize = (operation) => {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };
  const read = async () => {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return { records: [], nextEntry: 1, nextPage: 1 };
    const state = JSON.parse(raw);
    if (!Array.isArray(state.records) || !Number.isSafeInteger(state.nextEntry) || state.nextEntry < 1
      || !Number.isSafeInteger(state.nextPage) || state.nextPage < 1) {
      throw new Error("The saved local blotter data could not be read.");
    }
    return state;
  };
  const write = (state) => storage.setItem(STORAGE_KEY, JSON.stringify(state));

  return {
    list: () => serialize(async () => (await read()).records),
    save: (input, id) => serialize(async () => {
      const form = getBlotterFormValues(input);
      const errors = validateBlotterForm(form);
      if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
      const state = await read();
      const existing = id ? state.records.find((record) => record.id === id) : null;
      if (id && !existing) throw new Error("This local blotter record could not be found.");
      const values = Object.fromEntries(fields.map(({ key, column }) => [column, form[key].trim() || null]));
      const record = {
        ...existing,
        ...values,
        id: existing?.id || `local-blotter-${state.nextEntry}`,
        blotter_no: existing?.blotter_no || `ARGAO-BLT-${String(state.nextEntry).padStart(6, "0")}`,
        page_number: existing?.page_number || String(state.nextPage),
        created_at: existing?.created_at || new Date().toISOString(),
      };
      if (existing) {
        state.records = state.records.map((item) => item.id === id ? record : item);
      } else {
        state.records.unshift(record);
        state.nextEntry += 1;
        state.nextPage += 1;
      }
      // The numbers and record are committed together in the same storage value.
      await write(state);
      return record;
    }),
    remove: (id) => serialize(async () => {
      const state = await read();
      if (!state.records.some((record) => record.id === id)) throw new Error("This local blotter record could not be found.");
      state.records = state.records.filter((record) => record.id !== id);
      await write(state);
    }),
  };
};
