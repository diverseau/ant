import type { Ant, Colony, Connector, Message, Skill, Thread } from '../types'

const now = Date.now()
const min = 60_000
const hr = 60 * min

let seq = 0
export const uid = (p = 'm') => `${p}_${(++seq).toString(36)}_${Math.random().toString(36).slice(2, 7)}`

export const ants: Ant[] = [
  {
    id: 'chief',
    name: 'Chief',
    label: 'Main ant',
    description:
      'Chief of staff. Keep my week on track, coordinate the other ants, and bring me decisions, not noise. Never send anything external without asking.',
    color: 'coral',
    accessory: 'satchel',
    status: 'idle',
  },
  {
    id: 'inbox',
    name: 'Inbox',
    label: 'Gmail',
    description:
      'Get my inbox to zero every morning. Draft replies in my voice, archive newsletters, flag anything from investors. Drafts only, never send.',
    color: 'blue',
    accessory: 'satchel',
    status: 'attention',
  },
  {
    id: 'scout',
    name: 'Scout',
    label: 'Talent',
    description:
      'Find senior design engineers who have shipped consumer AI products. Draft intros, but never contact anyone directly.',
    color: 'green',
    accessory: 'leaf',
    status: 'idle',
  },
  {
    id: 'fixer',
    name: 'Fixer',
    label: 'Engineering',
    description:
      'Reproduce bugs from Linear in staging, attach screenshots and a minimal repro, and open a draft PR when the fix is obvious. Never touch production.',
    color: 'purple',
    accessory: 'wrench',
    status: 'working',
  },
  {
    id: 'sunny',
    name: 'Sunny',
    label: 'Sales outbound',
    description:
      'Build outbound lists from Salesforce and LinkedIn, write sequences, queue drafts. Nothing gets sent without my approval.',
    color: 'yellow',
    accessory: 'leaf',
    status: 'idle',
  },
]

export const colonies: Colony[] = [
  { id: 'offsite', name: 'Offsite crew', memberIds: ['chief', 'inbox', 'sunny', 'scout'] },
]

const t = (author: string, text: string, ago: number): Message => ({
  id: uid(),
  kind: 'text',
  author,
  text,
  at: now - ago,
})

export const threads: Thread[] = [
  {
    id: 'chief',
    kind: 'ant',
    refId: 'chief',
    unread: 0,
    pinned: true,
    updatedAt: now - 4 * min,
    messages: [
      { id: uid(), kind: 'system', author: 'system', text: 'Chief joined the colony', at: now - 30 * hr },
      t('user', 'Morning! What does today look like?', now - 9 * min),
      t(
        'chief',
        "Morning, Leon. Three things matter today:\n\n- **10:30** design review with Mara. I put last week's notes in the doc.\n- **Invoice from Northwind** is 4 days overdue. @Inbox drafted a nudge, waiting on you.\n- **Offsite**: the venue held our date until Friday. @Sunny is pulling the headcount.\n\nEverything else can wait. Want me to block focus time this afternoon?",
        8 * min,
      ),
      t('user', 'Yes, 2 to 5pm please', 6 * min),
      {
        id: uid(),
        kind: 'checklist',
        author: 'chief',
        at: now - 5 * min,
        items: [
          { service: 'Calendar', result: 'Focus block added', detail: '2:00 to 5:00 PM', ok: true },
          { service: 'Slack', result: 'Status set', detail: 'Heads down until 5', ok: true },
          { service: 'Gmail', result: 'Auto-reply', detail: 'skipped, not needed for 3 hours', ok: false },
        ],
      },
      t('chief', "Done. I'll hold anything non-urgent until 5 and give you a digest then.", 4 * min),
    ],
  },
  {
    id: 'inbox',
    kind: 'ant',
    refId: 'inbox',
    unread: 2,
    pinned: true,
    updatedAt: now - 22 * min,
    messages: [
      {
        id: uid(),
        kind: 'routine',
        author: 'inbox',
        name: 'Morning inbox zero',
        result: 'succeeded',
        at: now - 3 * hr,
      },
      t(
        'inbox',
        'Inbox is at zero. 41 archived, 6 labelled, **5 drafts** waiting. One needs you now: the Northwind invoice nudge.',
        25 * min,
      ),
      {
        id: uid(),
        kind: 'draft',
        author: 'inbox',
        channel: 'email',
        to: 'accounts@northwind.co',
        subject: 'Invoice #2291, quick check-in',
        body: "Hi Priya,\n\nHope the quarter's treating you well. Just checking on invoice #2291 from August, which looks to be a few days past due. Let me know if anything's needed on our side.\n\nThanks,\nLeon",
        at: now - 24 * min,
      },
      {
        id: uid(),
        kind: 'approval',
        author: 'inbox',
        action: 'Send email to accounts@northwind.co',
        detail: 'Gmail · "Invoice #2291, quick check-in"',
        connector: 'Gmail',
        at: now - 22 * min,
      },
    ],
  },
  {
    id: 'fixer',
    kind: 'ant',
    refId: 'fixer',
    unread: 0,
    pinned: false,
    updatedAt: now - 1 * min,
    messages: [
      t('user', 'Can you repro LIN-482? Checkout button does nothing on Safari.', 14 * min),
      t('fixer', "On it. Spinning up staging in Safari and following the steps from the ticket.", 13 * min),
      {
        id: uid(),
        kind: 'computer',
        author: 'fixer',
        title: 'Computer',
        text: 'Reproducing LIN-482 in staging, Safari 19',
        state: 'working',
        site: 'staging.acme.dev/checkout',
        at: now - 12 * min,
      },
      t(
        'fixer',
        "Reproduced. The click handler is attached to `button.pay` but Safari fires `pointerup` on the inner `<span>`, and we call `event.target.closest('.pay')` before the polyfill loads.\n\nTwo options:\n- Move the listener to `pointerdown` on the form\n- Await the polyfill before binding\n\nI'd go with the first. Want a draft PR?",
        1 * min,
      ),
    ],
  },
  {
    id: 'offsite',
    kind: 'colony',
    refId: 'offsite',
    unread: 0,
    pinned: false,
    updatedAt: now - 48 * min,
    messages: [
      { id: uid(), kind: 'system', author: 'system', text: 'Renamed to Offsite crew', at: now - 6 * hr },
      t('chief', 'Kicking this off. Goal: lock the offsite by Friday. @Sunny owns headcount, @Scout owns the venue shortlist, @Inbox handles comms.', 2 * hr),
      t('sunny', 'Headcount so far: **14 yes**, 3 maybe, 2 no. Chasing the maybes today.', 90 * min),
      t('scout', 'Shortlist is three venues. The barn in Healesville holds our date until Friday and fits 20.', 70 * min),
      t('inbox', "Drafted the save-the-date. Won't send until @Chief signs off.", 55 * min),
      t('chief', "Thanks @Inbox. Leon, that leaves the venue deposit. I'd spin up the booking once you're happy with the barn.", 48 * min),
    ],
  },
  {
    id: 'scout',
    kind: 'ant',
    refId: 'scout',
    unread: 0,
    pinned: false,
    updatedAt: now - 3 * hr,
    messages: [
      t('scout', '3 intros drafted in your voice. Held two candidates who were contacted last month.', 3 * hr),
    ],
  },
  {
    id: 'sunny',
    kind: 'ant',
    refId: 'sunny',
    unread: 0,
    pinned: false,
    updatedAt: now - 5 * hr,
    messages: [
      { id: uid(), kind: 'system', author: 'system', text: 'Renamed to Sunny', at: now - 7 * hr },
      t('sunny', "Checking what's connected. HubSpot, Gmail and LinkedIn are signed in. Salesforce isn't.", 6 * hr),
      {
        id: uid(),
        kind: 'computer',
        author: 'sunny',
        title: 'Computer',
        text: 'Sign in to Salesforce so I can see the accounts you own.',
        state: 'done',
        site: 'login.salesforce.com',
        at: now - 5.5 * hr,
      },
      {
        id: uid(),
        kind: 'checklist',
        author: 'sunny',
        at: now - 5 * hr,
        items: [
          { service: 'Salesforce', result: 'list pulled', detail: '52 accounts', ok: true },
          { service: 'HubSpot', result: '3 lookalike segments pulled', ok: true },
          { service: 'LinkedIn', result: '4 profiles skipped', detail: 'recently contacted', ok: true },
          { service: 'Sequencer', result: '36 drafts queued', detail: '0 sent', ok: true },
        ],
      },
    ],
  },
]

export const skills: Skill[] = [
  { id: 'brief', name: 'morning-brief', description: 'Calendar, inbox and blockers in one digest' },
  { id: 'repro', name: 'bug-repro', description: 'Reproduce a ticket in staging with screenshots' },
  { id: 'intro', name: 'warm-intro', description: 'Draft an intro email in my voice' },
  { id: 'recap', name: 'meeting-recap', description: 'Summarise a call transcript into actions' },
  { id: 'expense', name: 'expense-report', description: 'File receipts from Gmail into Ramp' },
]

export const connectors: Connector[] = [
  { id: 'gmail', name: 'Gmail', description: 'Read, label and draft email', installed: true, hue: 4 },
  { id: 'calendar', name: 'Google Calendar', description: 'Events and availability', installed: true, hue: 215 },
  { id: 'slack', name: 'Slack', description: 'Channels, DMs and status', installed: true, hue: 300 },
  { id: 'linear', name: 'Linear', description: 'Issues, projects and cycles', installed: true, hue: 240 },
  { id: 'github', name: 'GitHub', description: 'Repos, PRs and issues', installed: true, hue: 0 },
  { id: 'notion', name: 'Notion', description: 'Pages and databases', installed: false, hue: 30 },
  { id: 'salesforce', name: 'Salesforce', description: 'Accounts, leads, opportunities', installed: false, hue: 200 },
  { id: 'hubspot', name: 'HubSpot', description: 'CRM and sequences', installed: true, hue: 18 },
]
