export type TimeoutSweepFailure = {
  queue: string;
  stage: 'list' | 'publish' | 'runner';
  index?: number;
  error: unknown;
};

export type TimeoutSweepQueue = {
  name: string;
  run: () => Promise<TimeoutSweepFailure[]>;
};

/**
 * Builds an independently drained queue. A bad row or publication must not
 * prevent later rows in the same mode from being processed.
 */
export function createTimeoutSweepQueue<T>(
  name: string,
  list: () => readonly T[],
  publish: (item: T, index: number) => Promise<unknown> | unknown
): TimeoutSweepQueue {
  return {
    name,
    async run() {
      let items: readonly T[];
      try {
        items = list();
      } catch (error) {
        return [{ queue: name, stage: 'list', error }];
      }

      const failures: TimeoutSweepFailure[] = [];
      for (let index = 0; index < items.length; index++) {
        try {
          await publish(items[index], index);
        } catch (error) {
          failures.push({ queue: name, stage: 'publish', index, error });
        }
      }
      return failures;
    }
  };
}

/**
 * Runs each mode even if another mode's loader or worker fails. The returned
 * failures are diagnostic only; the caller decides how to log them.
 */
export async function runIndependentTimeoutSweeps(
  queues: readonly TimeoutSweepQueue[]
): Promise<TimeoutSweepFailure[]> {
  const failures: TimeoutSweepFailure[] = [];
  for (const queue of queues) {
    try {
      failures.push(...await queue.run());
    } catch (error) {
      failures.push({ queue: queue.name, stage: 'runner', error });
    }
  }
  return failures;
}
