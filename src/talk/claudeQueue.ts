/**
 * One Claude call in flight at a time across talk and villager chats (PRD 9.9 cost controls).
 * A talk sent while busy is queued; a newer talk replaces the queued one. Chats never queue:
 * they only run when nothing is in flight and no talk is waiting.
 */
type Job = () => Promise<void>;

let busy = false;
let queuedTalk: Job | null = null;

export function claudeBusy(): boolean {
  return busy || queuedTalk !== null;
}

async function run(job: Job): Promise<void> {
  busy = true;
  try {
    await job();
  } catch {
    // Jobs handle their own fallbacks; never let one wedge the queue.
  } finally {
    busy = false;
    const next = queuedTalk;
    queuedTalk = null;
    if (next) void run(next);
  }
}

/** Runs a talk job now, or queues it (latest wins) behind the call in flight. */
export function enqueueTalk(job: Job): void {
  if (busy) queuedTalk = job;
  else void run(job);
}

/** Runs a chat job only if the line is free. Returns false when skipped. */
export function tryChat(job: Job): boolean {
  if (busy || queuedTalk) return false;
  void run(job);
  return true;
}

/** Test helper. */
export function resetQueue(): void {
  busy = false;
  queuedTalk = null;
}
