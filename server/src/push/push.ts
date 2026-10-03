// Web Push to paired phones and browsers (installed Ant web app). VAPID keys are made on first
// use and kept in Ant's database; subscriptions are tied to the device that made them.
import webpush from 'web-push'
import type { Db } from '../db/index.ts'
import * as R from '../db/repos/index.ts'

export interface PushPayload {
  title: string
  body: string
  /** Opened when the notification is tapped, e.g. /?thread=… */
  url?: string
  /** Replaces an earlier notification with the same tag instead of stacking. */
  tag?: string
}

export class PushHub {
  private db: Db
  private subject: () => string
  /** Set by tests to capture instead of sending. */
  sender: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, body: string, opts: webpush.RequestOptions) => Promise<unknown> = (s, b, o) =>
    webpush.sendNotification(s, b, o)

  constructor(db: Db, subject: () => string) {
    this.db = db
    this.subject = subject
  }

  private keys(): { publicKey: string; privateKey: string } {
    let k = R.getSetting<{ publicKey: string; privateKey: string } | null>(this.db, 'push.vapid', null)
    if (!k) {
      k = webpush.generateVAPIDKeys()
      R.setSetting(this.db, 'push.vapid', k)
    }
    return k
  }

  publicKey(): string {
    return this.keys().publicKey
  }

  subscribe(deviceId: string | null, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    R.savePushSubscription(this.db, { endpoint: sub.endpoint, deviceId, keys: sub.keys })
  }

  unsubscribe(endpoint: string) {
    R.deletePushSubscription(this.db, endpoint)
  }

  count(): number {
    return R.listPushSubscriptions(this.db).length
  }

  async send(p: PushPayload, only?: string[]): Promise<number> {
    const subs = R.listPushSubscriptions(this.db).filter((s) => !only || only.includes(s.endpoint))
    if (!subs.length) return 0
    const { publicKey, privateKey } = this.keys()
    const body = JSON.stringify({ ...p, body: p.body.slice(0, 240) })
    let sent = 0
    await Promise.all(
      subs.map(async (s) => {
        try {
          await this.sender({ endpoint: s.endpoint, keys: s.keys }, body, {
            vapidDetails: { subject: this.subject(), publicKey, privateKey },
            TTL: 60 * 60,
            urgency: 'high',
            ...(p.tag && { topic: p.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) }),
          })
          sent++
        } catch (err) {
          // Gone: the browser dropped the subscription (app removed, permission revoked).
          const code = (err as { statusCode?: number }).statusCode
          if (code === 404 || code === 410) R.deletePushSubscription(this.db, s.endpoint)
        }
      }),
    )
    return sent
  }
}
