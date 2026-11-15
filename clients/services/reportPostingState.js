const idle = () => ({ status: "idle", draft: null, progress: "", error: "" });
export const postingIsActive = status => ["checking", "uploading", "saving"].includes(status);

// In-memory, account-scoped work. Screen unmounts do not own/cancel this task;
// logout/account replacement does. A browser refresh is not a durable job queue.
export function createReportPosting({ sessions, verify, upload, save, onSuccess = () => {} }) {
  let state = idle(), run = 0, controller = null, uploaded = null, owner = null;
  let completionRevision = 0;
  state.completionRevision = completionRevision;
  const listeners = new Set();
  const emit = patch => {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  };
  const reset = () => {
    run++;
    controller?.abort();
    controller = null;
    uploaded = null;
    owner = null;
    state = { ...idle(), completionRevision };
    listeners.forEach(listener => listener());
  };
  const unsubscribe = sessions.subscribe(event => { if (event.type === "session") reset(); });
  const execute = (retry = false) => {
    const ticket = ++run;
    controller = new AbortController();
    const signal = controller.signal;
    const current = () => ticket === run && sessions.current(owner?.epoch) && sessions.session()?.token === owner?.token;
    const draft = state.draft;
    const token = owner.token;
    emit({ status: retry ? "checking" : "uploading", error: "", progress: retry ? "Checking posting access…" : "Preparing your report…" });
    void (async () => {
      let saving = false;
      try {
        if (retry && !await verify(draft, token)) throw new Error("Posting access could not be confirmed. Complete any required account steps, then retry.");
        if (!current()) return;
        if (!uploaded) {
          emit({ status: "uploading", progress: draft.photos.length ? `Uploading photos 0/${draft.photos.length}…` : "Preparing your report…" });
          const urls = await upload(draft.photos, { token, signal, onProgress: ({ completed, total }) => {
            if (current() && total) emit({ progress: `Uploading photos ${completed}/${total}…` });
          } });
          if (!current()) return;
          uploaded = urls;
        }
        if (!current()) return;
        saving = true;
        emit({ status: "saving", progress: "Saving your report…" });
        const result = await save(draft, uploaded, { token, signal });
        if (!current()) return;
        if (!result?.report_id) throw new Error("The server did not confirm a report ID.");
        uploaded = null;
        completionRevision++;
        emit({ status: "success", draft: null, completionRevision, progress: "Report posted successfully. It is now pending review.", reportId: result.report_id });
        // Refresh failures must never change a confirmed save into a failed job.
        try { onSuccess(result); } catch {}
      } catch (error) {
        if (!current()) return;
        const denied = [401, 403, 429].includes(error?.response?.status);
        const uncertain = saving && !denied;
        emit({ status: uncertain ? "uncertain" : "failed", progress: "", error: uncertain
          ? "The server may have saved your report, but confirmation was not received. Check My Reports before posting again."
          : error?.response?.data?.error || error.message || "Your report was not posted. Please retry." });
      }
    })();
  };
  return {
    snapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start(draft, { token, epoch }) {
      if (!["idle", "success"].includes(state.status) || !token || !sessions.current(epoch) || sessions.session()?.token !== token) return false;
      owner = { token, epoch };
      uploaded = null;
      state = { ...idle(), completionRevision, draft: { ...draft, photos: [...draft.photos] } };
      execute();
      return true;
    },
    retry() {
      if (state.status !== "failed" || !owner || !sessions.current(owner.epoch)) return false;
      execute(true);
      return true;
    },
    edit() { if (state.status !== "failed") return false; emit({ status: "editing" }); return true; },
    takeDraft() {
      if (state.status !== "editing") return null;
      const draft = state.draft;
      reset();
      return draft;
    },
    dismiss() { if (["success", "uncertain"].includes(state.status)) reset(); },
    dispose() { unsubscribe(); reset(); },
  };
}
