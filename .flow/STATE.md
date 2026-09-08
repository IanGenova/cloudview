# Flow state — CloudView re-audit

Goal: fix the defects confirmed by live beta testing, verified in a browser.
Done = each fix demonstrated against the running app, tsc clean, pushed.

## Tasks
- [x] BT-01 NFC origin mismatch locked guests out — redirect now stays on the
      request origin so the cookie it just set survives. Verified: entry on
      localhost:3005 (previously an unrecoverable loop) now reaches the portal.
- [x] BT-02 HotelSettings leaked into guest HTML — explicit select; all seven
      xendit* columns gone from every guest surface.
- [x] BT-03 Prisma Decimal crossed the client boundary — converted once in the
      loader. React warning gone; money math unchanged (260 + 26 + 31.20 = 317.20).
- [x] BT-04 three unlabelled checkout inputs — all 9 controls now named.
- [x] BT-05 delta badge announced -100% as "100%" — direction in the accessible
      name, sign made visible.
- [x] BT-06 media root defaulted to a Linux path on dev machines — falls back to
      public/uploads outside production; production path unchanged.
- [x] BT-07 dead Place Order button — validation now speaks.
- [x] BT-08 "All 5" over a list of 4 — grid says "4 more items".
- [x] BT-09 redundant rows in the dashboard menu query - relations narrowed to
      the columns actually read, and the unused recipes/inventoryItem join
      removed outright. 86.2 KB -> 45.4 KB, a 47% cut.
- [x] BT-10 tag scanSecret stored in plaintext - now stored as an unsalted
      SHA-256 for verification plus an AES-256-GCM copy for re-display.
      No tag rotation was needed: the secret on the chip never changed, only
      how the database holds it. Verified end to end against a live chip URL.
      Plaintext column still exists but is empty; drop SQL is parked in
      prisma/manual/ deliberately, NOT in prisma/migrations/, so migrate deploy
      cannot drop it before the backfill runs.

## Post-audit regressions (mine, found in production)
- BT-01 fix broke guest access behind nginx: it redirected to the origin the
  request arrived on, which behind a proxy is 127.0.0.1:3000, so every tag tap
  sent guests to localhost. Fixed to honour X-Forwarded-Host.
- Re-running migrate deploy re-applied 20260525081653, whose enum drops ROOM.
  MySQL blanked every ROOM value in Location.type and NfcTag.tagType, breaking
  /dashboard/locations and /dashboard/tags. I had called MODIFY COLUMN
  idempotent; it is not when a sequence narrows an enum and then re-widens it.
  Repair SQL is with the user; both migrations are now recorded so it cannot
  recur.

## Hardening added after those
- nfc-redirect-origin.ts extracted from the launch handler and pinned with 15
  tests. Both origin bugs are cases in that file.
- deploy/deploy.sh resolves DATABASE_URL with Next's own env precedence, always
  runs migrate deploy, aborts before build/reload on failure, health-checks.
- scripts/migration-drift-report.cjs and migration-modify-check.cjs recover a
  migration history that drifted from hand-applied fixes.

## Decisions
- Guest-facing severity beat admin-facing severity throughout; BT-09 is the only
  finding skipped on cost/benefit rather than risk.
- The launch handler's *denial* redirects still use the configured origin. They
  carry no cookie, so the mismatch is harmless there, and leaving them alone
  kept the change to the one path that was broken.
- Delta badge still shows an up arrow at exactly 0. The accessible name says
  "No change" and the text shows no sign, so this is cosmetic only.

## Not verified in-browser
- BT-05 was verified by rendering the real component source in isolation, not
  through the analytics page: the dashboard session expired mid-run and logging
  in would mean entering a password.
