type PostgrestLikeError = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

function collectErrorText(error: unknown) {
  if (typeof error === "string") return error.toLowerCase();

  if (error && typeof error === "object") {
    const candidate = error as PostgrestLikeError;
    return [candidate.message, candidate.details, candidate.hint, candidate.code]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ")
      .toLowerCase();
  }

  return "";
}

export function isMissingJobsArchivedAtColumn(error: unknown) {
  const text = collectErrorText(error);

  return (
    text.includes("could not find the 'archived_at' column of 'jobs' in the schema cache") ||
    text.includes('column jobs.archived_at does not exist') ||
    text.includes('column "archived_at" does not exist') ||
    text.includes("archived_at") && text.includes("does not exist")
  );
}

export function getReadableErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;

  if (error && typeof error === "object") {
    const candidate = error as PostgrestLikeError;
    if (candidate.message) return candidate.message;
  }

  return fallback;
}
