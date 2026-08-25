import type { ItemStatus } from '@ai-knowledge-inbox/contracts';

export type JobState = 'queued' | 'running' | 'retry_wait' | 'succeeded' | 'failed';

const ITEM_TRANSITIONS: Record<ItemStatus, Set<ItemStatus>> = {
  queued: new Set(['processing', 'failed']),
  processing: new Set(['ready', 'retry_wait', 'failed']),
  retry_wait: new Set(['processing']),
  ready: new Set(),
  failed: new Set(),
};

const JOB_TRANSITIONS: Record<JobState, Set<JobState>> = {
  queued: new Set(['running']),
  running: new Set(['succeeded', 'retry_wait', 'failed']),
  retry_wait: new Set(['running']),
  succeeded: new Set(),
  failed: new Set(),
};

export function canTransitionItem(current: ItemStatus, next: ItemStatus): boolean {
  const allowed = ITEM_TRANSITIONS[current];
  return allowed ? allowed.has(next) : false;
}

export function assertTransitionItem(current: ItemStatus, next: ItemStatus): void {
  if (!canTransitionItem(current, next)) {
    throw new Error(`Invalid item state transition: ${current} -> ${next}`);
  }
}

export function canTransitionJob(current: JobState, next: JobState): boolean {
  const allowed = JOB_TRANSITIONS[current];
  return allowed ? allowed.has(next) : false;
}

export function assertTransitionJob(current: JobState, next: JobState): void {
  if (!canTransitionJob(current, next)) {
    throw new Error(`Invalid job state transition: ${current} -> ${next}`);
  }
}
