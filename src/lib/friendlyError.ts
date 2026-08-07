/**
 * Turns a raw Supabase/Postgres error into plain language a non-technical
 * user can act on. Falls back to the original message when there's no
 * better translation, so nothing is ever silently swallowed.
 */
export function friendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!error) return fallback;

  let message: string;
  let code: string | undefined;

  if (typeof error === 'string') {
    message = error;
  } else if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'object') {
    const err = error as { message?: string; code?: string };
    message = err.message ?? '';
    code = err.code;
  } else {
    message = '';
  }

  if (!message) return fallback;

  if (code === '23505' || /duplicate key value violates unique constraint/i.test(message)) {
    return 'That already exists — try a different name or value.';
  }
  if (code === '23503' || /violates foreign key constraint/i.test(message)) {
    return /^update or delete/i.test(message)
      ? "Can't complete this — it's still being used elsewhere. Remove those first."
      : "Can't complete this — the related record no longer exists.";
  }
  if (code === '23502' || /violates not-null constraint/i.test(message)) {
    return 'Please fill in all required fields.';
  }
  if (code === '42501' || /row-level security policy/i.test(message)) {
    return "You don't have permission to do that.";
  }
  if (/JWT expired|invalid JWT|refresh_token_not_found/i.test(message)) {
    return 'Your session has expired — please sign in again.';
  }
  if (/Failed to fetch|NetworkError|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION/i.test(message)) {
    return "Can't reach the server — check your internet connection and try again.";
  }

  return message;
}
