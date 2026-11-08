// Shared by the server and the upload forms, so the browser can refuse a huge file before sending it.
export const MAX_UPLOAD_MB = 30;
export const TOO_LARGE = `That file is too large (${MAX_UPLOAD_MB} MB max).`;
/** A message when the file is over the limit, otherwise "". */
export const fileTooLarge = (f: { size: number }) => (f.size > MAX_UPLOAD_MB * 1024 * 1024 ? TOO_LARGE : "");
