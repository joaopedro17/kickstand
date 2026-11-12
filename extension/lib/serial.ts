/**
 * A queue for read-modify-write changes to one stored value. Each task
 * starts once the previous one has finished, so it reads what that one
 * wrote and two quick changes can't overwrite each other. A failed task
 * doesn't stop the ones after it.
 */
export function serialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return (task) => {
    const run = tail.then(task);
    tail = run.catch(() => {});
    return run;
  };
}
