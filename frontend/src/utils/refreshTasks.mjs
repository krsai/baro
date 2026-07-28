export const runRefreshTasks = async (tasks = []) => {
  const results = await Promise.allSettled(
    tasks.map((task) => Promise.resolve().then(() => task()))
  );
  return {
    results,
    failed: results.some((result) => result.status === 'rejected'),
  };
};
