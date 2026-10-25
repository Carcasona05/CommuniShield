/** Bounded parallel uploads, preserving attachment order. Wait for every
 * started upload before returning an error; never silently omit failed photos. */
export async function uploadBatch(items, upload, { concurrency = 3, onProgress } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) {
    throw new Error("Upload concurrency must be between 1 and 3.");
  }
  const results = Array(items.length);
  const errors = [];
  let next = 0;
  let completed = 0;
  onProgress?.({ completed, total: items.length });
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = await upload(items[index]);
        completed++;
        onProgress?.({ completed, total: items.length });
      } catch (error) {
        errors.push({ index, error });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  if (errors.length) {
    const first = errors.sort((a, b) => a.index - b.index)[0];
    const error = new Error(`Photo ${first.index + 1} could not upload. Your report has not been submitted. Please try again.`);
    error.cause = first.error;
    throw error;
  }
  return results;
}
