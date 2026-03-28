export function isMissingJobsArchivedAtColumn(message: string | null | undefined) {
  return (
    message?.includes("Could not find the 'archived_at' column of 'jobs' in the schema cache") ?? false
  );
}
