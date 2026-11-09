import { getPrivacy } from "./store";
import { publicTag } from "./ga";

/** Added to the public privacy statement while Google Analytics is switched on, so it stays true even if the saved statement predates the feature. */
export const gaPrivacy = (asked: boolean) => `
## Google Analytics
When Google Analytics is turned on${asked ? ', and only after you click "Accept Cookie Usage",' : ","} our public pages load Google's analytics tag. It sets cookies and sends Google your IP address, browser and device details, and the pages you visit so we can count visitors and see which pages and sources (such as search engines or AI assistants) bring people to us. We do not use it for advertising and do not share your account details with Google. Staff pages are never tracked. Google handles this data under its own privacy policy. To opt out, block the tag in your browser or use Google's Analytics opt-out add-on (tools.google.com/dlpage/gaoptout).${asked ? ' You can change your cookie choice at any time with the "Cookie settings" link at the bottom left of any page.' : ""}
`;

/** The statement people read: the saved text, plus the Google Analytics section while it is on. */
export async function fullPrivacy() { const t = await publicTag(); return (await getPrivacy()) + (t.id ? gaPrivacy(t.banner) : ""); }
