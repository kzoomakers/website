// Shared by the server and the upload forms, so the browser can refuse a huge file before sending it.
// MAX_UPLOAD_MB is the hard ceiling (next.config.mjs lets 160 MB through middleware); the limit staff choose under Admin > Setup can only be lower (lib/image.ts: uploadLimitMb).
export const MAX_UPLOAD_MB = 150;
export const tooLarge = (mb: number) => `That file is too large (${mb} MB max).`;
/** A message when the file is over the limit (the ceiling unless the page knows the staff-set `mb`), otherwise "". */
export const fileTooLarge = (f: { size: number }, mb = MAX_UPLOAD_MB) => (f.size > mb * 1024 * 1024 ? tooLarge(mb) : "");
