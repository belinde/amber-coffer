/** Reads a translated message for a dotted field path (e.g. eventsInteresting.0.summary). */
export function fieldErrorAt(
  fieldErrors: Readonly<Record<string, string>> | undefined,
  path: string,
): string | undefined {
  if (!fieldErrors) return undefined;
  if (fieldErrors[path]) return fieldErrors[path];
  const prefix = `${path}.`;
  for (const [key, message] of Object.entries(fieldErrors)) {
    if (key.startsWith(prefix)) return message;
  }
  return undefined;
}

/** Clears errors whose path equals or nests under the edited prefix. */
export function clearFieldErrorsForPrefix(
  fieldErrors: Record<string, string>,
  pathPrefix: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, message] of Object.entries(fieldErrors)) {
    if (key !== pathPrefix && !key.startsWith(`${pathPrefix}.`)) {
      next[key] = message;
    }
  }
  return next;
}
