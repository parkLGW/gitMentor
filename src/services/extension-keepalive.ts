export async function withKeepAlive<T>(
  task: () => Promise<T>,
  ping: () => Promise<void> | void,
  intervalMs = 20_000
): Promise<T> {
  const runPing = () => {
    Promise.resolve()
      .then(() => ping())
      .catch(() => {
        // Keepalive failures should never block the primary task.
      });
  };

  runPing();

  const timer = setInterval(() => {
    runPing();
  }, intervalMs);

  try {
    return await task();
  } finally {
    clearInterval(timer);
  }
}
