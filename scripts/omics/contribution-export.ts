import { deploymentFlag } from "../contribution-deployment.mjs";

/** Inspect the rendered controls, not Next.js hydration payloads or script text. */
export function verifyContributionExport(html: string, expectedFlag: string | undefined) {
  const enabled = deploymentFlag(expectedFlag, "NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED");
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const closed = markup.includes("Submissions are not open yet.");
  const emailForm = (markup.match(/<form\b[^>]*>[\s\S]*?<\/form>/gi) || []).find(form =>
    /<input\b[^>]*\btype="email"/i.test(form) &&
    /<button\b[^>]*>\s*Email me a sign-in link\s*<\/button>/i.test(form),
  );
  if (enabled && (closed || !emailForm))
    throw new Error("Enabled contribution export must show the email sign-in form and no closed notice");
  if (!enabled && (!closed || /<input\b[^>]*\btype="email"/i.test(markup)))
    throw new Error("Disabled contribution export must show its closed notice and no email sign-in control");
  if (!enabled && !markup.includes("Download draft"))
    throw new Error("Disabled contribution export must retain local draft download");
  const buttons = markup.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) || [];
  if (markup.includes("Copy library access token") || buttons.some(button =>
    button.includes("Submit for review") && !/^<button\b[^>]*\bdisabled(?:[\s=>])/i.test(button),
  )) throw new Error("Static contribution export must not expose authenticated controls");
  const metas = markup.match(/<meta\b[^>]*>/gi) || [];
  if (!metas.some(meta => /\bname="referrer"/i.test(meta) && /\bcontent="no-referrer"/i.test(meta)))
    throw new Error("Contribution referrer protection missing");
  if (/googletagmanager|google-analytics|goatcounter/i.test(html))
    throw new Error("Analytics in contribution workflow");
  return enabled;
}
