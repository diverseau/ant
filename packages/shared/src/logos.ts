// Which website's logo to show for a connector or channel. antd downloads and caches the
// logo (GET /api/logos/:domain); null means show the letter tile.

const KNOWN: Array<[RegExp, string]> = [
  [/\bgmail\b/i, 'mail.google.com'],
  [/google calendar|\bgcal\b/i, 'calendar.google.com'],
  [/google drive|\bgdrive\b/i, 'drive.google.com'],
  [/google docs/i, 'docs.google.com'],
  [/google sheets/i, 'sheets.google.com'],
  [/google cloud|\bgcp\b/i, 'cloud.google.com'],
  [/\bclaude\b|\banthropic\b/i, 'claude.ai'],
  [/\bcloudflare\b/i, 'cloudflare.com'],
  [/\bsupabase\b/i, 'supabase.com'],
  [/\badobe\b/i, 'adobe.com'],
  [/\bslack\b/i, 'slack.com'],
  [/\btelegram\b/i, 'telegram.org'],
  [/\bdiscord\b/i, 'discord.com'],
  [/\bgithub\b/i, 'github.com'],
  [/\bgitlab\b/i, 'gitlab.com'],
  [/\bnotion\b/i, 'notion.so'],
  [/\blinear\b/i, 'linear.app'],
  [/\bjira\b/i, 'atlassian.com'],
  [/\bconfluence\b|\batlassian\b/i, 'atlassian.com'],
  [/\basana\b/i, 'asana.com'],
  [/\bfigma\b/i, 'figma.com'],
  [/\bcanva\b/i, 'canva.com'],
  [/\bstripe\b/i, 'stripe.com'],
  [/\bpaypal\b/i, 'paypal.com'],
  [/\bhubspot\b/i, 'hubspot.com'],
  [/\bintercom\b/i, 'intercom.com'],
  [/\bzapier\b/i, 'zapier.com'],
  [/\bdropbox\b/i, 'dropbox.com'],
  [/\bbox\b/i, 'box.com'],
  [/\begnyte\b/i, 'egnyte.com'],
  [/\bdocusign\b/i, 'docusign.com'],
  [/\bvercel\b/i, 'vercel.com'],
  [/\bnetlify\b/i, 'netlify.com'],
  [/\bsentry\b/i, 'sentry.io'],
  [/\bairtable\b/i, 'airtable.com'],
  [/\btodoist\b/i, 'todoist.com'],
  [/\bclickup\b/i, 'clickup.com'],
  [/\bmonday\b/i, 'monday.com'],
  [/\boutlook\b|microsoft 365|\bm365\b/i, 'outlook.com'],
  [/microsoft teams|\bteams\b/i, 'teams.microsoft.com'],
  [/\bsalesforce\b/i, 'salesforce.com'],
  [/\bshopify\b/i, 'shopify.com'],
  [/hugging ?face/i, 'huggingface.co'],
  [/\bgranola\b/i, 'granola.ai'],
  [/\bplaywright\b/i, 'playwright.dev'],
  [/\bfirecrawl\b/i, 'firecrawl.dev'],
  [/\bexa\b/i, 'exa.ai'],
  [/\bspotify\b/i, 'spotify.com'],
  [/\byoutube\b/i, 'youtube.com'],
]

export const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/**
 * claude.ai connectors are brands, so an unknown one is guessed as <first word>.com.
 * Custom connectors only use a known brand or their remote URL's site, never a guess.
 */
export function logoDomain(name: string, opts: { url?: string; guess?: boolean } = {}): string | null {
  for (const [re, domain] of KNOWN) if (re.test(name)) return domain
  if (opts.url) {
    try {
      const host = new URL(opts.url).hostname.toLowerCase().replace(/^(mcp|api|server|sse)\./, '')
      if (DOMAIN.test(host) && !/^(localhost|127\.|10\.|192\.168\.)/.test(host)) return host
    } catch {}
  }
  if (opts.guess) {
    const word = name.toLowerCase().match(/[a-z0-9]+/)?.[0]
    if (word && word.length > 1) return `${word}.com`
  }
  return null
}
