const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const day = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

export function fmtTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return time.format(d)
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return day.format(d)
}

export function clock(ts: number): string {
  return time.format(new Date(ts))
}

export function greeting(name: string, d = new Date()): string {
  const h = d.getHours()
  if (h < 5) return `Up late, ${name}?`
  if (h < 12) return `Morning, ${name}`
  if (h < 17) return `Afternoon, ${name}`
  if (h < 22) return `Evening, ${name}`
  return `Up late, ${name}?`
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const mod = isMac ? '⌘' : 'Ctrl'
