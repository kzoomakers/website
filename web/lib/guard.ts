// POC has no auth yet (Phase 2: Auth.js). Until then the editor + write API exist only outside production.
export const editingAllowed = () => process.env.NODE_ENV !== "production";
