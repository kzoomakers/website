// Internal addresses (health checks and the like) that are never worth a row in the HTTP log. Matches with or without the IPv4-mapped "::ffff:" prefix.
const SKIP_IPS = new Set(["172.19.19.81", "172.19.31.1"]);
export const skipped = (ip: string) => SKIP_IPS.has(ip.replace(/^::ffff:/i, ""));
