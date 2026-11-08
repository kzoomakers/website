import { llmsDocs } from "@/lib/llms";

export const dynamic = "force-dynamic";

// Every page's full text in one file, for AI assistants that want the content, not just the index.
export async function GET() {
  return new Response((await llmsDocs()).map((d) => `# ${d.title}\n${d.url}\n\n${d.text}\n`).join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
