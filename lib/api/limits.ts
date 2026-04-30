// Public limits for the analyze endpoint. Kept free of server-only and zod
// imports so client components (e.g., the analyze form character counter)
// can read the same numbers the server enforces.
export const MAX_BODY_BYTES = 200 * 1024;
export const MIN_TEXT_LENGTH = 10;
export const MAX_TEXT_LENGTH = 50_000;
