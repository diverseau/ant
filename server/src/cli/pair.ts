// Print a one-time code for pairing a phone or another computer with Ant, for setups with no
// browser on the machine itself (Docker, a home server). Usage: npm run pair
import { loadConfig } from '../config.ts'
import { openDb } from '../db/index.ts'
import { Auth } from '../auth/auth.ts'

const cfg = loadConfig()
const db = openDb(cfg.dbPath)
const { code, expiresAt } = new Auth(db).newPairingCode()
db.close()
const urls = [process.env.ANT_PUBLIC_URL].filter(Boolean)
console.log(`Pairing code: ${code}`)
console.log(`Valid until ${new Date(expiresAt).toLocaleTimeString()} (10 minutes), works once.`)
console.log(urls.length ? `Open ${urls[0]}/?pair=${code.replace('-', '')} on the device, or enter the code there.` : 'Open Ant on the device and enter the code.')
