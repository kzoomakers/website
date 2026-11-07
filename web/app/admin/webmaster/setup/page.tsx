import { redirect } from "next/navigation";
import { editingAllowed } from "@/lib/guard";
import { envConfig } from "@/lib/config";
import Form from "./form";

export const dynamic = "force-dynamic";

export default async function Setup() {
  if (!(await editingAllowed())) redirect("/api/auth/signin?callbackUrl=/admin/webmaster/setup");
  const env = envConfig();
  if (env) return (
    <div style={{ maxWidth: 560 }}>
      <h1>Services</h1>
      <p className="sub">Postgres and storage are configured through environment variables, so they can't be changed here. Edit the environment and restart to change them.</p>
      <p className="ok">✓ Postgres: {URL.canParse(env.databaseUrl) ? new URL(env.databaseUrl).host : "configured"}</p>
      <p className="ok">✓ Storage: {env.s3.endpoint} / {env.s3.bucket}</p>
    </div>
  );
  return <Form />;
}
