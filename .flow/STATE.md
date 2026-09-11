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

## Loyalty accrual (9 Sep 2026)
- [x] Points now accrue on order.subtotalCents, not totalCents. The hotel was
      paying loyalty on the 12% VAT it remits to the BIR and on the 10%
      service charge. On the local data: 37 -> 28 points across 8 taxed
      orders, 24% less liability. Guest decision, made by the user.
- [x] The rule had two implementations - rewards.ts and an inline copy in
      guest-point-sync.ts that never called it. Extracted to
      guest-points-accrual.ts, pinned with 10 tests, both paths now call it.
      The shared function returns a skipReason because that is what the
      duplicate existed for: guest-point-sync reports why it declined.
- [ ] Math.floor still drops the per-order remainder. Left alone: it is a
      product decision, not a defect, and was not part of the ask.

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

## Ultra inspection and repair (10 Sep 2026)

Full report sealed at `.flow/ULTRA-2026-09-10.md`: 54 findings — 9 BLOCKER,
31 MAJOR, 14 MINOR — from a clean checkout, a disposable MySQL 8.4.7, and six
independent readers. Repaired on branch `ultra/blocker-repairs-20260910`,
local commits only, nothing pushed.

- [x] BLOCKER 1 backup restore let a hotel admin write their own role from an
      unsigned archive, and matched users across every tenant. Scoped, clamped,
      authVersion bumped. `3958a72`
- [x] BLOCKER 3 next was pinned "latest" and had resolved to 16.2.6 — two
      unauthenticated RCE advisories. Pinned to 16.3.4; audit reports no
      critical. `3958a72`
- [x] BLOCKER 4 the guest order page shipped every HotelSettings column in its
      RSC payload: Xendit merchant id, commission rate, fee bearer, wifi
      password. Proven with canaries, then proven gone. This is BT-02 again on
      a surface that ran its own query. `3958a72`
- [x] BLOCKER 5 ingredient stock only ever went down. restoreInventoryForOrder
      added; verified live 100→98→100. `3958a72`
- [x] BLOCKER 6 a replayed payment webhook overwrote the finalizer's claim,
      rolled back the order and auto-refunded a good payment. `3958a72`
- [x] BLOCKER 7/8 the folio double-charged partially-refunded orders and
      under-billed room charges by discounting an already-discounted total.
      One tested rule now, in `guest-stay-folio-charges.ts`. `3958a72`
- [x] All 31 MAJORs except 6, 16, 28, 30. `71b16cc` `e0de608` `7d8c805`
      `1478fbf` `757c055` `fecdaec`
- [x] All 14 MINORs. `fecdaec` + this commit
- [ ] BLOCKER 2 the migration chain does not apply to an empty database and 12
      tables are created by no migration at all. Needs migrations written and a
      baseline decision — ultra does not write them.
- [ ] BLOCKER 9 `GuestPointSettings` has no screen, so a hotel cannot change
      its earn rate or switch loyalty off without SQL.
- [ ] MAJOR 6 POS sales charge no VAT or service charge; the guest portal
      charges both. Fixing it changes what customers pay at the till — a
      pricing decision, not a defect to correct quietly.
- [ ] MAJOR 16 a PAY_LATER folio balance can never be collected. Needs a
      post-checkout folio payment action and screen.
- [ ] MAJOR 28 POS integration cannot be turned on. Needs settings screens, or
      drop the model, `src/lib/pos.ts` and `/api/pos/mock`.
- [ ] MAJOR 30 the backup/restore audit trail is write-only. Matters more than
      it looks given BLOCKER 1.

### Carried, needs a migration
MAJOR 10 (`@@unique` on the stock-restore key), MAJOR 14 (split
`xenditCommissionValue` into percentage and fixed columns), MINOR 2 (unique
reserved-redemption key), MINOR 14 (drop `MenuDailyStock`,
`SubscriptionPackage`, `HotelSubscription` and their unreachable enum values).
Each has a code-level guard in place; each sits behind BLOCKER 2, so adding to
the chain now would compound it.

### Notes
- Ingredient restore is real on the demo seed but a no-op in production until
  something can create a `ProductInventoryRecipe` — nothing can today.
- Tests went 45 → 140. Ten new test files, all written RED first.
- `.flow/tdd-exempt` lists the config/ops/fixture paths outside TDD scope.
- Corrects the earlier decision recorded above: the launch handler's denial
  redirects were **not** harmless. They carry `?k=<scan secret>` in the query
  string, so a tag credential crossed to another origin. Fixed in `71b16cc`.

## DEPLOYED — 11 Sep 2026

**Production (`srv1830788`, 187.77.129.233) is serving `d165453`.** Health
check 200; `/api/qr` answers 401 where the old code served a PNG to anyone,
which is the proof the new build is live. `cloudview-refund-retry` is running
on Node 22, saved to the pm2 dump, and its first poll returned "Nothing to
retry" against the real endpoint. Backup taken beforehand:
`/var/www/cloudview-backups/pre-ultra-deploy-20260910-234414.sql.gz`.

### Three things the deploy surfaced that will bite the next one
- **The server's `~/.ssh/config` points `github.com` at `id_ed25519`, which
  GitHub now rejects.** `cloudview_github` authenticates as
  `IanGenova/cloudview` and is the right key. This deploy used
  `GIT_SSH_COMMAND="ssh -i ~/.ssh/cloudview_github -o IdentitiesOnly=yes"` for
  the pull; nothing on the server was changed. Fix the `IdentityFile` line or
  every future `deploy.sh` fails at the pull, as this one did first time.
- **`deploy.sh` must run with nvm loaded.** The system Node is 18.19.1; the app
  runs on nvm's 22.23.1. A non-interactive shell does not source nvm, so
  `next build` refused with "Node.js >=20.9.0 is required" — after `git pull`
  and `npm ci` had already run, leaving the tree ahead of the running process
  until the build was redone under 22. Either source `~/.nvm/nvm.sh` at the top
  of `deploy.sh`, or always run it from a login shell.
- **`pm2 start ecosystem.production.cjs` did not work on pm2 7.** It ran the
  file as a script and created a process named `ecosystem.production`. pm2
  only treats `*.config.{js,cjs,json}` as ecosystem files. Renamed to
  `ecosystem.production.config.cjs` in the ULTRA-2026-09-11 repair (task F);
  the server still runs the apps started by path with `--name`, which the
  renamed file describes identically.

### Observed, not part of the audit
`cloudview-nextjs` had restarted 28 times in 46 hours before this deploy —
roughly every 100 minutes, consistent with hitting `max_memory_restart: 700M`.
Worth a look; it is why the half-deployed state above was time-sensitive.

### Earlier state, kept for the record

### Where the code is
- `ultra/blocker-repairs-20260910` — pushed to origin, 10 commits.
- `main` — fast-forwarded to `65d11a7` and **pushed** (this commit). The
  server's `git pull --ff-only` will now pick the work up.
- Re-verified on 11 Sep before pushing: `tsc --noEmit` clean, **140 tests
  pass**. The previous session's run was cut off by a tool outage, not a
  failure.

### Local config changed
`git config core.fileMode false` was set on this checkout. The three
`deploy/*.sh` files showed as modified with a zero-line diff — mode 755 vs 644,
an artifact of the Windows backup copy — and that blocked the merge. No file
content was discarded.

### The three decisions already taken (do not re-litigate)
1. Merge to `main`, then deploy — chosen over checking the branch out on the VPS.
2. Run `node scripts/migration-drift-report.cjs` on the VPS **before** anything
   writes. It is read-only: parameterised `SELECT COUNT(*)` against
   `information_schema` only.
3. App server is **187.77.129.233**.

### Remaining, in this order
1. ~~Test suite~~ — done 11 Sep, 140 pass.
2. ~~`git push origin main`~~ — done 11 Sep.
3. ~~Drift report on the VPS~~ — done 11 Sep. **Clean.** Production is
   `u610581005_cloudviewdb` at `srv2093.hstgr.io:3306`; `prisma migrate status`
   says "Database schema is up to date!", 30/30 applied. So `migrate deploy` is
   a no-op on this deploy. (The local dev database was the one with no
   `_prisma_migrations` table — a `db push` build, not a proxy for production.)
   BLOCKER 2 still stands for any *new* environment.
4. ~~mysqldump~~ — done 11 Sep:
   `/var/www/cloudview-backups/pre-ultra-deploy-20260910-234414.sql.gz`
   (60 tables, 62K, `--single-transaction --column-statistics=0`; the first
   attempt without `--column-statistics=0` produced a 1-table stub — the client
   is mysqldump 8 against an older server).
   Pre-deploy checks on the box: `MENU_UPLOAD_DIR` set in
   `.env.production.local`, `CLOUDVIEW_MEDIA_ROOT` set in `.env`, so both are
   live and the changed fallbacks never engage. `NFC_PUBLIC_APP_URL` already
   set. Only an untracked `storage/` in the tree, so `--ff-only` is clear. Both
   `/var/www/cloudview-uploads/menu` (51 files) and `cloudview-media/menu` (59)
   exist — MINOR 13's history on disk, pre-existing, untouched by this deploy.
   Server clock is UTC.
5. After deploying: start the workers by hand (the ecosystem file, since
   renamed to `ecosystem.production.config.cjs`) — the deploy script only does
   `pm2 reload cloudview-nextjs`, so the new `cloudview-refund-retry` worker
   will not start on its own.
6. Check the production `.env` for `MENU_UPLOAD_DIR` / `CLOUDVIEW_MEDIA_ROOT`.
   The production media-root fallback moved from `/var/www/cloudview-media` to
   `/var/www/cloudview-uploads` to match the nginx alias. If those are set,
   nothing changes; if they are not, image paths move.
   Add `NFC_PUBLIC_APP_URL` if that host is not `cloudhotelph.com`.

## Phase: repair ULTRA-2026-09-11 (11 Sep 2026) — SHIPPED locally, 8 commits 31e89f6..ab8f020

Goal: every finding in `.flow/ULTRA-2026-09-11.md` moves to `fixed`, proven by the
finding inverted — a test where the rule is logic, a curl where it is a redirect.
Done = 7 status lines read `fixed`, tsc clean, suite green, build green, local commits.

Tasks (batched by root cause):
- [x] A  MAJOR 1 + MINOR 3 (31e89f6, corrected in 94cd044; [::1] follow-on in dba2a4e) — resolver treats a loopback
      forwarded host as usable when it equals the request's own Host header (Next
      synthesises it from Host). The first cut compared against request.url, which Next
      builds from the BIND name, so it honoured localhost and still refused 127.0.0.1 --
      the curl in the finding still went to cloudhotelph.com. Caught in CHECK by the live
      curl, not by the suite. README step 4 names NFC_PUBLIC_APP_URL. by test:
      nfc-redirect-origin.test.ts pins the measured header set; curl on a loopback bind
      stays local (re-driven after the correction).
      Follow-on found by the same curl: with the resolver now honouring loopback, the
      HTTPS policy saw `[::1]` (URL.hostname keeps the brackets) as public and 308-ed
      every path to https. Brackets stripped before the loopback check; test pins it.
- [x] B  MAJOR 2 (42b4c7c; re-driven live in CHECK: bun 99->99, patty 59->59, bread 117->116) — inventory-requirements uses the active quantity, skips CANCELLED
      lines, on deduct and restore alike. by test.
- [x] C  MINOR 1 (d39236b) — PASSCODE_LOCKED shows its own message, with the minutes. by test on the mapper.
- [x] D  MINOR 2 (3a931b6; rows read in CHECK) — cancelling a PAID cash/counter order records the refund due:
      paymentStatus REFUND_PENDING + a history note naming the amount. by test on the
      rule, rows read after.
      Rows read in CHECK on all three paths (orders 5, 6, 7 in the disposable DB). The
      guest tracking page rendered the raw enum as "Refund_pending" once cash orders could
      reach it -- now goes through the page's own paymentLabel(), "Refund pending".
- [x] E  MINOR 4 (f6bd516) — npm audit fix; dropped concurrently, local-ssl-proxy,
      start:http and start:https; npm start is now next start -H 127.0.0.1 -p 3000.
      by test: audit critical 0 (13 advisories -> 5: 3 high are the Prisma CLI's
      deepmerge-ts chain, 2 moderate are exceljs->uuid; both 'fixes' are downgrades).
- [x] F  MINOR 5 (f6bd516) — ecosystem.production.cjs -> ecosystem.production.config.cjs;
      README and .env.example follow. deploy.sh never named the file (it only reloads
      cloudview-nextjs), so nothing to change there. by test: no command or config
      references the old name; README explains it once as history.

Assumptions:
- D: no schema change. REFUND_PENDING already exists in PaymentStatus and the dashboard
  renders it; that is the signal. A "mark cash refunded" action is a later phase.
- A: production and LAN are unaffected either way; the fix must not change the proxied
  path's behaviour. nginx-cloudview.conf sends a real forwarded host.

CHECK (11 Sep): tsc clean; 166 tests pass; production build green at ab8f020 on the frozen
clone D:\_ultra\cv2; every finding re-driven on that build against the disposable DB and
recorded in the report's Stage 4 section. Evidence: 7 by test (all closed), 2 by artifact
(the lockout screen at desktop and 375px, the dashboard timeline showing the refund-due
row -- both captured in the browser pane, not saved as files), 0 by person.

Stage 3 readers were lost with the session that launched them; the report records stage
3 as not run. Next inspection owes it.

Left open on purpose: a "mark cash refunded" action that clears REFUND_PENDING for a
hand-returned refund (the natural next phase of MINOR 2); the six carried blockers.

Wakes since commit: 0.
