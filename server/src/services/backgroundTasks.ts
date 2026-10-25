import { waitUntil } from "@vercel/functions";

/** Track post-response work on Vercel instead of starting a floating promise
 * that can be frozen when HTTP completes. Local Node runs the same promise.
 * This is lifecycle tracking, NOT a durable/retryable job queue. */
export const backgroundTasks = {
  schedule(name: string, task: () => Promise<void>) {
    const work = Promise.resolve().then(task).catch((error: unknown) => {
      console.error(`Background task failed (${name}):`, error);
    });
    try {
      waitUntil(work);
    } catch (error) {
      // Never turn an already-persisted report into a misleading submit failure.
      console.error(`Could not track background task (${name}) on this runtime:`, error);
    }
    return work;
  },
};
