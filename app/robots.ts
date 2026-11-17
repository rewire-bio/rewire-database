import { MetadataRoute } from "next";

export const AI_BOT_USER_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
  "Amazonbot",
  "Applebot-Extended",
  "Cohere-ai",
  "Bytespider",
] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
      {
        userAgent: [...AI_BOT_USER_AGENTS],
        allow: [
          "/",
          "/use-cases/",
          "/models/",
          "/benchmarks/",
          "/evidence/",
          "/agents/",
          "/coverage/",
          "/updates/",
          "/llms.txt",
          "/agents.md",
        ],
        disallow: ["/api/"],
      },
    ],
    sitemap: "https://benchmarks.rewirebio.io/sitemap.xml",
    host: "https://benchmarks.rewirebio.io",
  };
}
