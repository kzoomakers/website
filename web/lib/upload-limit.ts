// Shared by the server and the upload forms, so the browser can refuse a huge file before sending it.
// Two limits, both set by staff under Admin > Setup (lib/upload-cfg.ts): signed-in people may upload up to `mb` (hard ceiling MAX_UPLOAD_MB), anyone else may send a request of at most `publicMb`
// (hard ceiling MAX_PUBLIC_MB: Next.js buffers a request body in memory up to 10 MB for every route behind middleware, so a public cap above that would be silently cut).
export const MAX_UPLOAD_MB = 150, MAX_PUBLIC_MB = 10;
export const DEFAULT_UPLOAD_MB = 70, DEFAULT_PUBLIC_MB = 10;
export const tooLarge = (mb: number) => `That file is too big. The most you can upload is ${mb} MB. Choose a smaller file, or shrink or crop it and try again.`;
export const publicTooLarge = (mb: number) => `That is too big to send. Without signing in, the most you can send is ${mb} MB. Sign in to upload larger files, or send something smaller.`;
/** A message when the file is over the limit (the ceiling unless the page knows the staff-set `mb`), otherwise "". */
export const fileTooLarge = (f: { size: number }, mb = MAX_UPLOAD_MB) => (f.size > mb * 1024 * 1024 ? tooLarge(mb) : "");
/** Throws a message an admin can act on unless both numbers are whole, in range, and public <= signed-in. */
export function checkLimits(l: { mb: number; publicMb: number }) {
  if (!Number.isInteger(l.mb) || l.mb < 1 || l.mb > MAX_UPLOAD_MB) throw new Error(`Signed-in limit: enter a whole number from 1 to ${MAX_UPLOAD_MB}.`);
  if (!Number.isInteger(l.publicMb) || l.publicMb < 1 || l.publicMb > Math.min(MAX_PUBLIC_MB, l.mb)) throw new Error(`Public limit: enter a whole number from 1 to ${Math.min(MAX_PUBLIC_MB, l.mb)} (never more than the signed-in limit).`);
}
