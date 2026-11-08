import { llmsDocs } from "@/lib/llms";
import { llmsTxt } from "@/lib/aiseo";

export const dynamic = "force-dynamic";

// Public index of the site for AI assistants.
export async function GET() {
  return new Response(llmsTxt("Kzoo Makers is a community makerspace in Kalamazoo, Michigan.", await llmsDocs()), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
