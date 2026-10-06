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

Deployed (11 Sep 2026, ~10:20 Manila): main pushed bf55954..cdc6e64; deploy/deploy.sh on
the VPS (dry run first) pulled cdc6e64, ran npm ci (lockfile changed), migrate deploy
against u610581005_cloudviewdb (30/30, no new migrations), built, reloaded
cloudview-nextjs; health check 200. Workers untouched and online. concurrently and
local-ssl-proxy gone from the server's node_modules. Public NFC denial redirect still
stays on https://cloudhotelph.com through nginx. Note: a bare `npx prisma migrate status`
on the box reads the decoy .env (cloudview@localhost) and reports a pending migration --
that is the trap deploy.sh exists for; against the real database the schema is up to date.


## Phase: guide-ux-quick (11 Sep 2026)

Owner's words (11 Sep): "Can you check the UI/UX for the hotel guide in the admin portal
and the guest portal ... is it user friendly?" then, on the review, "Can you fix that
now???" -- the small items offered in that review. The plan gate is suspended by the
owner for this phase (`.flow/plan-off`, their file); the admin form restructure is out.

### Intent
- I1 A guest finds the answer on the first try, typing the way people type on phones.
- I2 A search hit is the card that holds the answer, not the drawer it is in.
- I3 Labels on the guest guide are readable on a phone.
- I4 A manager can see a section as a guest sees it, from the admin page, in one click.

Tasks:
- [x] G1 search normalisation + synonyms -- `src/lib/guide-search.ts`. by test (12).
      CHECK found "Wi-Fi" splitting into "wi"/"fi" fragments that matched "with" and
      "first" everywhere (5 results, Pool Hours first); words under four letters are no
      longer tried on their own. "pool hours" then put Restaurant Hours first (every
      hours card says "hours"; Dining sorts first): items are ranked by how much of the
      query their title carries, ties in guide order. 13 tests. from: I1
- [x] G2 item-level results with a deep link to the card (`#guide-item-<id>`); sections
      only when the section's own text matched. by test (same file) + by artifact:
      capture of "Results for breakfast" showing the Restaurant Hours card. from: I2
- [x] G3 every 9-10px label on the guest guide raised to 12px (`text-xs`); faint 35-45%
      labels raised to 60%. "detail" kept -- a recorded vocabulary decision, consistent
      with the section page. by artifact: capture at 375px. from: I3
- [x] G4 admin "Open guest guide" + per-section "View as guest": the hotel's public tag
      launch URL with `to=guide/<slug>`; the launch handler lands on `/t/<tag>/<path>`
      only for a plain relative lowercase path (`src/lib/nfc-return-path.ts`), else home.
      Shown only to users who may view NFC tags (the secret is the same one the Tags page
      shows). Slug rule moved to `src/lib/guide-slug.ts`, one copy. by test (9 + 4) +
      by artifact: capture of the section card with the link. from: I4
- [x] G5 CHECK (fed5dea): tsc clean; 192 tests; production build green on the frozen
      clone three times (2b191ac, 0a37b2d, fed5dea); driven at 375px against the
      disposable DB with the starter guide loaded. "wifi" / "wi fi" / "Wi-Fi" -> 3
      results, Wi-Fi card first; "checkout" / "check out" -> the check-in/out card;
      "breakfast" -> Restaurant Hours card then the Dining section (captured); "pool
      hours" -> Pool Hours first; the item link lands on the card 214px from the top,
      clear of the header. Labels captured at 375px: the "Curated guide" badge now reads.
      Admin: "Open guest guide" next to Managing, "View as guest" first in each section's
      action row; the link taps the pool tag and lands on /t/<tag>/guide/dining. Ten
      hostile `to=` shapes (absolute URL, //host, ../, ?query, uppercase, javascript:)
      all land on the portal home. Captures live in the browser pane, not on disk.
      from: I1, I2, I3, I4

Decisions:
- Bottom nav keeps Home highlighted inside the Guide: deliberate in GuestShell
  ("Hotel Guide belongs to Home"), same convention as iOS child screens. Not changed.
- Room tags are never used for the preview link: a tap on one lands on the passcode
  screen, not the guide.
- Static Wi-Fi / arrival cards in search results match on added keywords
  (wifi/internet/password, checkin/checkout/arrival/departure).

Evidence: 3 by test (closed), 3 by artifact (closed by the captures above), 0 by person.
Shipped locally: 2b191ac, 0a37b2d, fed5dea, 906143a. Pushed 11 Sep ~12:02 (owner created
`.flow/allow-push`); deployed to the VPS at 906143a via deploy.sh (dry run first, no
migrations, health 200). Proven on cloudhotelph.com through the real Pool Deck tag:
"wifi" / "wi fi" / "internet" -> Wi-Fi card first, "checkout" / "check out" -> the
check-in/out card, "breakfast" -> Restaurant Hours; the admin "View as guest" link
lands on /t/LNRX6MKW/guide/dining.
Wakes since commit: 0.

## Phase: guide-photo-titles (11 Sep 2026) — Quick

Owner's words (11 Sep, with a screenshot of the live Facilities page): "can you fix
this??" -- the gallery hero captioned "d885ab12 d9f0 43c2 9976 02eddeebb8db".

### Intent
- P1 A photo nobody named shows no caption -- never a file name.

Tasks:
- [x] P1 `src/lib/guide-image-title.ts`: a file name is a title only when it reads like
      one (UUIDs, hex hashes, IMG_/DSC_/PXL_, screenshots, WhatsApp images, "image (3)",
      timestamps -> no title; "pool-deck-sunset.jpg" -> "Pool deck sunset"). The upload
      stores null instead of "Gallery Image N"; the guest gallery and the admin photo list
      run stored titles through the same test, so the three rows already on the live site
      present as untitled without a data change. The hero card shows nothing where it
      showed the file name. by test (6). from: P1
- [x] P2 the section screen's remaining 9-10px labels (photo count badge, gallery modal,
      Wi-Fi card) lifted to 12px / 60%, same as the guide home last phase. by artifact:
      capture at 375px in CHECK. from: P1
- [x] P3 CHECK (a936423): tsc clean, 198 tests, build green on the frozen clone. Uploaded
      three photos through the disposable admin -- d885ab12-....png, IMG_20260911_101512.png,
      sunset-over-the-pool.png -- and read the rows: null, null, "Sunset over the pool".
      The guest Facilities page at 375px shows the hero photo with the "3 photographs"
      badge and no caption; no UUID or IMG text anywhere on the page. from: P1

Decision: the three stored titles on production are left as they are; the display guard
makes them invisible and a data fix would be the owner's call.

Evidence: 1 by test (closed), 1 by artifact (closed by the 375px capture in CHECK), 0 by person.
Shipped locally: a936423, 5446cab. Pushed and deployed to the VPS at 5446cab (11 Sep
~12:40, dry run first, no migrations, health 200). The live Facilities page from the
owner's screenshot now shows the hero photo with no caption; the three stored UUID titles
are left in the database and simply not shown.
Wakes since commit: 0.

## Phase: uiux-audit (2 October 2026) — report sealed, apply gated

`/flow:uiux` on the whole product. Stages 1–3 complete; stage 4 (apply) has not started and
cannot: `.flow/uiux/pending` holds every source write closed until the owner runs
`node .flow/uiux/2026-10-02/confirm.mjs`.

- Captured 141 screens of `2c7e5eb` from a disposable instance (fresh MySQL on 3399, pm2 on
  3007, Chrome via playwright-core, 1440 and 390, light and dark). Harness, captures and
  measurements under `D:/_ultra/uiux/`; the record is `.flow/uiux/2026-10-02/STAGE-1-CAPTURE.md`.
- Six lenses returned **72 findings — 5 BLOCKER, 55 MAJOR, 12 MINOR**, sealed in
  `.flow/UIUX-2026-10-02.md` with a status line each.
- Five causes; five screen groups; seven screens designed, rendered and published for review
  at <https://claude.ai/artifact/G2i6CALe3HjdzB3REq7rNo>.
- **Six decisions are with the owner** (typeface pair, dashboard regroup + renames, guest tab
  bar + merging `/orders` with `/activity`, whether the portal follows the theme, kitchen TV
  Mode as default, landing page in or out of scope). Group E does not start until they answer.
- Correction to an earlier claim in this session: emoji in interface chrome is **one**
  instance (`☁`, `GuestShell.tsx:55`), not zero. A Unicode grep in this environment reported
  zero; a plain search finds it.
- The disposable environment is still up (pm2 app `cvuiux`, MySQL on 3399 from `D:/_ultra/db`).

### What CHECK caught

The first re-capture run was worthless and nearly went in as proof: the disposable MySQL
had stopped and the minted session had expired, so every guest route captured a 500 and
every dashboard route captured the login page. The evidence gate had already refused the
commit for ticking S4 with no artifact on disk; this is the same failure one step later.
Re-driven against a live database and a fresh session.

### What CHECK caught

Capping the weight scale at 600 made every `<strong>` in the product render **heavier**
than before. Tailwind preflight sets `b, strong { font-weight: bolder }`, and CSS maps
`bolder` from an inherited 600 straight to 900 — so four elements in the cart drawer came
back at 900 wearing no weight class at all. Pinned `b, strong` to 600 in the base layer.
The sweep itself also needed four passes: the first skipped any string containing a brace
(so it missed every template literal), the second missed arbitrary variants like
`[&_button]:rounded-lg` and class strings spanning lines, and the third kept `rounded-dot`
on progress-bar tracks, which are pills rather than dots.

Wakes since commit: 0.

## Phase: uiux-A-system (5 October 2026) — Full

Owner confirmed the redesign captures on 2 Oct (`.flow/uiux-confirmed`,
`60ed6326…`) and said "start now" without answering the six decisions. Taken as
deferral to the recommendations, recorded here as assumptions rather than
treated as answered:

- **A1 typeface = EB Garamond + Instrument Sans** — what the confirmed captures show.
- **A2 the guest portal stays permanently dark** — it already is; this makes it a rule.
- **A3 kitchen TV Mode becomes the default** — group C, not this phase.
- **A4 the landing page is out of scope** — no group F.
- **Group E is NOT assumed and does not start.** The dashboard regroup, the three renames,
  the guest tab bar and merging `/orders` with `/activity` rename and restructure things
  staff and guests have learned. Those wait for the owner in their own words.

Authority: `.flow/UIUX-2026-10-02.md` and the review artifact
<https://claude.ai/artifact/G2i6CALe3HjdzB3REq7rNo>.

### Goal
The product's radius, colour, type, spacing, hairlines and component states are defined
once, in `globals.css`, `tailwind.config.ts` and one pure class module — and every screen
inherits that without 92 files being rewritten in one commit.

### Acceptance criteria
- [x] S1 `--cv-radius: 0` and a `--cv-hairline` token exist, and every Tailwind radius scale
      value resolves to 0, so the 1,996 `rounded-*` occurrences render square without being
      edited. by test: a unit test asserts the config maps every radius key to `0`.
      from: UIUX-2026-10-02 § The verdict — five causes, cause 1
- [x] S2 `font-black` caps at 600 — the scale is remapped so the 1,481 occurrences cannot
      render heavier than the brief allows. by test: config assertion.
      from: UIUX-2026-10-02 § The verdict — five causes, cause 1
- [x] S3 `shadow-soft` is no longer a 60px glow. by test: config assertion.
      from: UIUX-2026-10-02 § The verdict — five causes, cause 1
- [x] S4 EB Garamond and Instrument Sans load through the Next font loader in
      `src/app/fonts.ts`, exposed as `--cv-serif` / `--cv-sans`, with real fallback stacks.
      That loader cannot be imported outside a Next build, so this is not provable by unit
      test and the criterion says so:
      by test: `npm run build` compiles;
      by artifact: `.flow/uiux/2026-10-02/applied/A-manifest.json`, which records the
      computed family per capture — `interfaceSans` and `displaySerif` on both surfaces.
      `src/app/fonts.ts` added to `.flow/tdd-exempt` for the same reason as next.config.mjs.
      from: artifact § Six decisions, decision 1
- [x] S5 One pure module builds every primitive's classes, tested: no radius class, no
      weight above 600, a visible `focus-visible` ring at 2px/2px offset that does not
      depend on `outline-none` being absent, and a 44px minimum on every interactive box.
      by test: `src/lib/ui-classes.test.ts`. from: UIUX-2026-10-02 § Findings — A11Y-10
- [x] S6 The six `ui/` primitives use that module and keep their public API unchanged, so
      the 121 importing files still compile. by test: `tsc --noEmit` clean; full suite green.
      from: artifact § Five groups — Group A
- [x] S7 Status renders as a dot and a word, never a filled pill, from one helper.
      by test: `ui-classes.test.ts`. from: UIUX-2026-10-02 § Findings — A11Y-8
- [x] S8 The screens still render. 31 captures of 10 routes at both widths, all HTTP 200.
      Measured against the 2 October captures of the same routes: radius-bearing elements
      **1,579 -> 240**, weight-900 elements **1,475 -> 2**, both faces loading on both
      surfaces. The 80 remaining radius kinds and the 11 glows on the cart are arbitrary
      Tailwind values that bypass the scale — the sweep phase edits those, as framed.
      by artifact: `.flow/uiux/2026-10-02/applied/A-d02-orders--desktop--light.png`, with
      the whole set and its numbers beside it in `A-manifest.json`.
      from: artifact § Five groups — Group A

### Tasks
- [x] T1 `src/lib/ui-classes.ts` + test — the pure class layer (S5, S7). 15 assertions.
- [x] T2 `tailwind.config.ts` — radius, weight, shadow, fonts, hairline (S1, S2, S3). 9 assertions in `design-tokens.test.ts`.
- [x] T3 `src/app/fonts.ts` + `layout.tsx` — **self-hosted** via `next/font/local`, not Google. The Turbopack build cannot reach fonts.googleapis.com from this host, and a build that needs the network to compile breaks in CI; a guest's phone also stops asking Google for anything. 118KB of variable woff2 in `src/app/fonts/`. (S4)
- [x] T4 `src/app/globals.css` — `--cv-radius`, `--cv-hairline` on all five palettes, `--cv-status-done`, and a `:focus-visible` rule that overrides the 149 `outline-none` utilities until the sweep removes them (S1)
- [x] T5 the six primitives, on the tested class module, public API unchanged (S6)
- [x] T6 CHECK — tsc clean, 222 tests, production build green, 31 captures re-driven

Deferred to A-sweep (the next phase, not this one): deleting the now-inert `rounded-*`,
`font-black` and `shadow-soft` class names from the 92 files, and the arbitrary-value
radii (`rounded-[2rem]` ×145) which bypass the scale and must be edited.

Wakes since commit: 0.

## Phase: uiux-A-sweep (5 October 2026) — Quick

Group A made every radius and weight inert at the Tailwind scale. This removes the dead
class names and the arbitrary values that bypass the scale, so the source says what the
product does.

### Acceptance criteria
- [x] W1 `grep -rE "rounded-|font-black|shadow-soft" src/` returns only documented
      exceptions: `rounded-dot` on status dots and spinners, and the three files that
      assert on these names (`ui-classes.ts`, `ui-classes.test.ts`, `design-tokens.test.ts`).
      by test: a check script counts them. from: UIUX-2026-10-02 § The verdict, cause 1
- [x] W2 The 463 arbitrary radii (`rounded-[2rem]` ×144, `rounded-[1.5rem]` ×143 and 12
      more values) are gone — these bypass the scale and are why 240 elements were still
      round after group A. by test: the same check.
      from: UIUX-2026-10-02 § Findings — VH-7
- [x] W3 Decorative glow shadows go (`shadow-soft` ×19 and the arbitrary blurs of 18px and
      above); the 1px inset hairline highlights stay, and `shadow-float` remains for things
      that genuinely float. by test: the same check.
      from: UIUX-2026-10-02 § The verdict, cause 1
- [x] W4 `active:scale-*` ×70 is gone — nothing in the product bounces or scales.
      by test: the same check. from: artifact § Where the brief was right
- [x] W5 tsc clean, 222 tests, production build green, 31 captures at HTTP 200. Measured
      across the ten routes at both widths: radius-bearing elements **1,579 -> 6** (the six
      are status dots), distinct radii **141 -> 2**, elements at weight 900 **1,475 -> 0**.
      by artifact: `.flow/uiux/2026-10-02/applied/W-*.png`.
      from: artifact § Five groups — Group A

Not in this sweep, and why: `backdrop-blur` ×130 stays. Some of those are a scrim holding
text legible over a photograph — A11Y-2 is that there are not *enough* scrims — so which
ones go is a per-screen judgement in groups B and C, not a regex. `font-black` becomes
`font-semibold`, the new ceiling; deciding which of those 1,484 elements should actually
be 400 or 500 is the per-screen work in B through E, and this phase does not pretend to
have done it.

Wakes since commit: 0.

## Phase: uiux-C1-dangerous-actions (5 October 2026) — Full

Group C, first half: the two blockers and the destructive-action vocabulary. The console's
layout work (figure blocks, hairline tables, the duplicate headings, the kitchen's TV-Mode
sizing) is C2 and is not in this phase.

### Acceptance criteria
- [x] C1 One tested rule decides which staff actions need confirming and what the
      confirmation says: cancelling a guest's order and declaring money collected always
      do, and the words always name the order and the amount; moving an order forward
      never does. by test: `src/lib/staff-confirm.test.ts`.
      from: UIUX-2026-10-02 § Findings — IX-1, IX-2
- [x] C2 The kitchen's Reject goes through it. Driven live: it asks "Cancel order
      CVDHFO000001? The whole order -- P707.60 -- is cancelled..." and dismissing it left
      the row PENDING. Today it is a bare `onClick` that fires
      `updateOrderStatusAction(CANCELLED)` with no dialog, no reason and no undo, 8px from
      Accept at the same size — while the same action on the desk is gated behind a reason
      modal. by test: the rule; by artifact: a capture of the kitchen ticket.
      from: UIUX-2026-10-02 § Findings — IX-1 (blocker)
- [x] C3 Both Mark Paid buttons go through it. Driven live: "Record payment for
      CVDHFO000007? This says the hotel has P707.60... paid at the counter.", and the confirmation restates the amount.
      by test: the rule; by artifact: a capture of an order card.
      from: UIUX-2026-10-02 § Findings — IX-2 (blocker)
- [x] C4 No **destructive** control is a filled slab any more. Five became hairlines; the
      two that stay filled are the error toast icon and the final confirm inside the cancel
      modal, where solid red is the right weight. **Not closed by this:** Mark Paid is still
      the widest, most saturated control on the card -- that is VH-4's hierarchy half and
      belongs to C2's layout work. Original wording:
      Reject on the kitchen and on the board, and Cancel Item in the modal, use the
      hairline danger variant the primitives already define. by artifact: the same captures.
      from: UIUX-2026-10-02 § Findings — VH-4, IX-3
- [x] C5 The three always-green READY rows above Mark Paid are gone — they could not show
      any other value, and sat above a money decision on an order badged UNPAID.
      by artifact: a capture of the order-detail modal.
      from: UIUX-2026-10-02 § Findings — CP-12
- [x] C6 tsc clean, 245 tests, production build green, 31 captures at HTTP 200.
      by artifact: `.flow/uiux/2026-10-02/applied/C-*.png`.
      from: artifact § Five groups — Group C

Not renaming anything. "Accept", "Reject" and "Serving" stay as they are: CP-3 is that one
order lifecycle is told in four vocabularies, and choosing the one word is decision 2,
which the owner has not answered.

Wakes since commit: 0.

## Phase: uiux-C2a-headers-and-tiles (5 October 2026) — Quick

Owner, pointing at the Service Requests screen and its row of five tiles reading
0 / 0 / 0 / 0 / ₱0.00: "Can you removed all the headers and the analytics in each modules,
it can cause caught up spaces". This is VH-10 and the vanity-stat ban from the original
brief, and the owner asking for it outranks the group ordering.

Read as: **one header per screen** — the `PageHeader` stays, the hero card that repeats it
goes — and the stat strips go from the modules whose job is not counting.

### Acceptance criteria
- [x] H1 Service Requests: the five-tile strip and the "Service Operations Center" heading
      are gone; the search and status filter stay. by artifact: `H-AFTER-requests`.
      from: UIUX-2026-10-02 § Findings — VH-10, ST-9
- [x] H2 Orders: the dark "Order Command Center / Order Operations Board" hero, its
      ATTENTION / KITCHEN QUEUE pair, its four metric tiles and the third "Order Queue"
      heading are gone. The board said "Orders" four times before the first order.
      by artifact: the measurement below. from: UIUX-2026-10-02 § Findings — VH-10, VH-2
- [x] H3 Inventory (both tabs) and Rewards: stat strips removed.
      from: UIUX-2026-10-02 § Findings — ST-6
- [x] H4 Measured against the pre-audit build running on the same database at the same
      moment: total page height across eight captures **21,145px -> 17,260px, 18% shorter**.
      Service Requests on a phone 2,650 -> 1,730 (-920px); Inventory 2,349 -> 1,617
      (-732px); Orders 6,686 -> 5,653 (-1,033px). by artifact:
      `.flow/uiux/2026-10-02/applied/H-*.png`. from: artifact § Five groups — Group C

### Kept, deliberately
Figures stay where counting is the module's job: `/dashboard` home, `/dashboard/analytics`,
`/dashboard/reports`. Removing those would remove the point of the screen rather than the
clutter.

### Still carrying a hero card, not done in this phase
`/dashboard` home, `rewards`, `services`, `settings/backups`, `tags`. Each is a bespoke
block rather than a shared component, so each needs its own edit and its own capture; the
generic remover walked to the wrong enclosing element and was abandoned rather than let
loose on five files.

Wakes since commit: 0.

## Phase: uiux-C2b-remaining-heroes (5 October 2026) — Quick

Owner: "yes, remove those five too". The five modules the previous phase left carrying a
hero card: the dashboard home, rewards, services, backups and NFC tags.

### Acceptance criteria
- [x] F1 All five hero cards gone. Each was a bespoke block, so each was bounded by
      reading it rather than by a pattern; the generic remover from the last phase was
      used only to report boundaries, never to edit.
      from: UIUX-2026-10-02 § Findings — VH-10
- [x] F2 Every real control inside those heroes survives, moved out above the content:
      "Create NFC Tag", "Create Service / Add-on" and backups' "Refresh".
      from: artifact § What this does not change
- [x] F3 The dashboard home is the one page with no `PageHeader` — its `<h1>` *was* the
      48px slogan "Today's hotel operations pulse.". Replaced with a plain serif "Today",
      and its Needs Attention panel and figure grid kept, because counting is that
      screen's job. from: UIUX-2026-10-02 § Findings — VH-2
- [x] F4 NFC Tags also lost a second four-tile strip and a third heading
      ("Search & Filters / Find NFC Access Points"); the search and filters stay.
      from: UIUX-2026-10-02 § Findings — VH-10
- [x] F5 Three tile components left rendering nothing were deleted — `LuxuryStatCard`,
      the rewards-local `StatCard`, `NfcMetricCard`. tsc does not flag an unused function,
      so they would have sat there as the next person's confusion.
- [x] F6 Measured against the pre-audit build on the same database at the same moment:
      **22,889px -> 18,062px across ten captures, 21% shorter**, every route HTTP 200.
      NFC Tags on a phone 3,830 -> 2,477 (-1,353px); Services 2,272 -> 1,494 (-778px).
      by artifact: `.flow/uiux/2026-10-02/applied/F-*.png`.
      from: artifact § Five groups — Group C

Section headings that carry their own information stay — "Stored Archives", "Recovery
Activity", "Recommended services". The rule is one header per screen, not one heading.

Wakes since commit: 0.

## Phase: uiux-C3-console-truth (5 October 2026) — Full

Owner: "continue with the rest of group C". The six findings group C still had open after
the confirmation gate, the tile strips and the hero cards: the queue that ignored the
filter, the kitchen's own sizing, the word on a cancelled dish, Mark Paid's prominence,
the detail modal's action order, and the stock figure a phone could not reach.

### Acceptance criteria
- [x] C1 The Focus Queue is drawn from the filtered list. With `zzzznothing` in the search
      box, measured on the same database at the same moment: badge **6 -> 0**, the panel's
      order list **six codes -> none**, "Nothing urgent in this filter." in place of "No
      urgent order right now.", and a "Within the current filters" line under the heading
      so the empty panel is not read as an empty board. The main list said "No orders
      found." in both builds. by artifact: `.flow/uiux/2026-10-02/applied/C2-measured.json`.
      from: UIUX-2026-10-02 § Interaction design — IX-9
- [x] C2 The kitchen renders its own readable layout by default. The page parsed
      `mode === 'tv' ? 'tv' : 'rush'`, so every arrival landed in the densest mode and the
      `'normal'` branches the cards were written for were unreachable code. Measured
      before -> after on the live screen: order code **9px -> 18px**, dish lines
      **10px -> 14px**. `?mode=rush` still gives 9px/10px, so nothing was removed.
      by artifact: `.flow/uiux/2026-10-02/applied/C2-measured.json`.
      from: UIUX-2026-10-02 § Visual hierarchy — VH-9
- [x] C3 Two consequences of that default, found while fixing it and fixed with it: the
      "Rush Mode" button rendered permanently engaged and linked to the mode it was
      already in — it now reads "Exit Rush" and carries `aria-pressed`; and a kitchen
      notification's deep link forced `mode=rush`, which is how the dense layout became
      the effective default. A notification points at an order; it does not decide how
      the cook wants the board laid out.
- [x] C4 A cancelled dish carries a word in the dense lane. Proven by cancelling one
      through the product's own form and reading both builds back: before **0** occurrences
      of "CANCELLED" with the strikethrough alone carrying the state; after **1**, plus the
      strikethrough and the dot's `aria-label`. The audit's claim that the state was only a
      dot was partly inaccurate — red, a strikethrough and an `aria-label` were already
      there — so the fix is the missing word, not the whole treatment.
      by artifact: `.flow/uiux/2026-10-02/applied/C2-measured-modal-and-cancelled.json`.
      from: UIUX-2026-10-02 § Accessibility — A11Y-8
- [x] C5 Mark Paid is no longer the loudest control. On an order card, measured:
      **328px wide, `rgb(5, 150, 105)` filled -> 160px, white, hairline**, and it now
      names the amount it would settle ("Mark Paid · ₱707.60") on the control rather than
      only in the confirmation that follows the click. Reject went from a filled
      `rgb(220, 38, 38)` slab to a transparent hairline. One filled control remains per
      card: the workflow move. The forward action also stopped changing colour with the
      status — it was black, then amber, then amber, then emerald for one decision.
      by artifact: `.flow/uiux/2026-10-02/applied/C2-measured.json`.
      from: UIUX-2026-10-02 § Visual hierarchy — VH-4
- [x] C6 The detail modal's aside reads **Accept & Prepare -> Reject -> Mark Paid ·
      ₱707.60 -> Print Summary**, one filled control, and the last thing against the
      modal's bottom edge is Print Summary rather than Reject.
      by artifact: `.flow/uiux/2026-10-02/applied/C2-measured-modal-and-cancelled.json`.
      from: UIUX-2026-10-02 § Interaction design — IX-11
- [x] C7 The stock figure reaches a phone. The inventory table is 1,180px wide in a 390px
      viewport, so three of eight cells are in view; the figures sat behind a sideways
      scroll. They now travel with the item name below `lg`: measured `figureInView`
      **false -> true**, the name cell reading "Breakfast Pancakes | Cloud View Demo Hotel
      · Breakfast | Available 19 · Sold 6". The table keeps its full detail for anyone who
      scrolls. by artifact: `.flow/uiux/2026-10-02/applied/C2-c06-inventory--mobile--light.png`
      from: UIUX-2026-10-02 § Accessibility — A11Y-9
- [x] C8 Readable type does not fit a layout built for 9px, and the first capture of C2
      proved it: the kitchen lane's grid used the default `auto` track, which grows to its
      widest item's min-content, so the card ran 389px inside a 335px lane and clipped the
      timer and the Reject button against the edge. `minmax(0,1fr)` caps the track — card
      307px in a 335px lane, nothing overflowing. The first attempt at that then truncated
      the order code to "CVDHF…" to make room for the status and the timer, which is worse
      than clipping on a ticket, so outside rush the code takes the whole line and the
      badges sit beneath it. Measured and looked at, not assumed.
      by artifact: `.flow/uiux/2026-10-02/applied/C2-c04-kitchen--desktop--light.png`
- [x] C9 Six `<th>` elements on the analytics stock table were still rendering at 700 —
      a bare `th` takes the browser's own `bold`, the same leak as `b, strong { bolder }`
      from the group-A phase, through a different door. Capped in the same base layer.
      Across the 21 captures, elements above weight 600: **3,688 -> 0**.
      by artifact: `.flow/uiux/2026-10-02/applied/C2-manifest.json`
- [x] C10 Machine stage green: `tsc --noEmit` clean, 238 tests pass across 23 files, the
      production build compiles, every captured route HTTP 200 (21/21 on both servers).
      The three standing greps return only documented exceptions — 21 `rounded-dot`, and
      every remaining `font-black` / `shadow-soft` is a test or a comment naming the thing
      it replaced. Measured across the same 21 captures, before -> after: radius-bearing
      elements **3,238 -> 48** (all `9999px` status dots), distinct radius values
      **158 -> 6**, tap targets under 44px **294 -> 280**.

### What this phase did not touch
`A11Y-7` was closed in the same round before this record was framed: the analytics donut
legends had the series names in the markup all along, but `truncate` inside a narrow flex
row cut them to "P", "A…", "P…" while three of six dots shared a colour. The row wraps now.

Making TV Mode the kitchen's default is decision 5 and still the owner's — this phase made
the *readable* mode the default, which is not the same thing and needed no decision. Group
E remains blocked on the owner's own words.

### Deviation
The audit measured the kitchen's "default" type sizes as 14px/12px. They are 9px and 10px:
the screen it measured was rush mode, because rush was the default. The finding was right
about the defect and wrong about the numbers, and the cause was one ternary.

### Measurement notes
The first pass of the group-C assertion script reported the inventory fix as absent. It
sliced each cell's text to 48 characters before testing it for a digit, and the figure sits
past that point — the probe was measuring its own truncation. Corrected and re-run before
anything was recorded.

The clipping in C8 was not caught by any number. Every probe was green — one `<h1>`, no
radii, no weight above 600, no overflowing document — while the timer read "LAT" and the
Reject button was cut in half. It was caught by looking at the capture, which is what the
captures are for.

Wakes since commit: 0.

## Phase: uiux-B-guest-spine (5 October 2026) — Full

Owner: "now continue with group B". Arrival, menu, cart, checkout and confirmation — the
path a guest actually walks. Tracking is deliberately untouched: the audit lists its
waiting discipline and its state copy under What is kept.

### Acceptance criteria
- [x] B1 The dish name is off the photograph. Measured against the real image at the size
      it renders, sampling the pixels directly beneath the text: white over the lightest
      pixel was **1.00:1** on a pale dish and **2.14:1** on a darker one, 9.24:1 at the mean
      — the ratio was a property of whichever photograph the hotel had uploaded, which is
      the defect. The name and price now sit on the card's own surface, composited
      rgb(16, 16, 16): **19.06:1**. The category keeps its place on the image and its plate
      went from 55% to 75% black under full white.
      by artifact: `.flow/uiux/2026-10-02/applied/B-measured.json`
      from: UIUX-2026-10-02 § Accessibility — A11Y-2 (BLOCKER)
- [x] B2 The guest reaches the first dish within one screen. A filled gold rewards panel, a
      second back arrow, a second title and a hero card stood between the top of the menu
      and the food. Measured on a 390×844 phone: first dish at **904px -> 546px**, page
      **2,102 -> 1,646px**, headings **5 -> 3**, largest type **32px "Delicious moments,
      delivered." -> 24px "Chef's selection"**. The cart moved into the bar that was
      already sticky, so it no longer scrolls away.
      by artifact: `.flow/uiux/2026-10-02/applied/B-b02-menu--mobile--light.png`
      from: UIUX-2026-10-02 § Content and copy — CP-1, § Visual hierarchy — VH-2
- [x] B3 The rewards upsell stops wearing the primary colour, and there is one of it. The
      menu carried a filled gold panel with a 24px heading and a gold button; the checkout
      carried a second. Both are a line and a text link now, and the only filled gold
      control on the checkout is the one that places the order.
      from: UIUX-2026-10-02 § Interaction design — IX-4
- [x] B4 The checkout stops claiming something untrue. "Auto-filled from the active stay"
      sat under an empty box, because this NFC panel is a public location with no stay
      attached to it. It says that only when the stay actually supplied the value, and
      otherwise says what the field is for.
      from: UIUX-2026-10-02 § Interaction design — IX-5
- [x] B5 A rejected order says what is wrong at the field it is wrong at. Driven through
      the product with the name empty: focus moves to `menu-ordered-by`, the field carries
      `aria-invalid="true"`, the message is written beneath it in red, the `role="alert"`
      banner still carries it for a screen reader, and two fields show a visible "Required".
      Fields marked required **4 -> 5**, fields with a description **0 -> 2**.
      by artifact: `.flow/uiux/2026-10-02/applied/B-measured.json`
      from: UIUX-2026-10-02 § Interaction design — IX-6
- [x] B6 Emptying the cart asks first and stops being a twin of the way out. It was a 44px
      icon button mirroring the back arrow and it fired on the first tap. It is now a word
      under the list it empties, and it asks: "Remove everything from this order? · 1 item ·
      ₱463.60 · You will need to choose the dishes again." Dismissed, the cart still held
      its dish. by artifact: `.flow/uiux/2026-10-02/applied/B-measured.json`
      from: UIUX-2026-10-02 § Interaction design — IX-7
- [x] B7 Quantity controls are thumb-sized. Across 24 captures of eight guest routes, tap
      targets under 44px went **57 -> 12**. The cart's own controls went 32px and 36px to
      44px; the guide's Wi-Fi reveal and copy — named in the finding — went 32px to 44px.
      The twelve that remain are three elements: a checkbox whose 24px box sits inside a
      44px label that is the actual target, a 44px button the probe rounds to 43.98, and
      one link measured mid-entrance-animation at 44 × 0.985 = 43.34.
      from: UIUX-2026-10-02 § Accessibility — A11Y-3, § Interaction design — IX-10
- [x] B8 The control that commits the money names it: "Place order · ₱317.20", or "Pay
      ₱317.20 securely" for Xendit. The confirmation screen stopped being a centred 36px
      "Thank You, <name>!" above centred reassurance with the order code at 15px three
      blocks below — the code is the heading now, left-aligned, and the line above it
      thanks the guest in passing. Page **952 -> 848px**.
      by artifact: `.flow/uiux/2026-10-02/applied/B-b07-confirmed--mobile--light.png`
      from: UIUX-2026-10-02 § Visual hierarchy — VH-2
- [x] B9 Measured across the 24 captures, pre-audit build to current, same database:
      radius-bearing elements **810 -> 0**, elements above weight 600 **456 -> 0**, total
      document height **50,526 -> 46,519px**, 24/24 routes HTTP 200 on both.
      `tsc --noEmit` clean, 238 tests pass, the production build compiles.
      by artifact: `.flow/uiux/2026-10-02/applied/B-manifest.json`

### Found inaccurate
`VH-11` claims two `<h1>` elements on four guest screens. Measured on arrival, menu and
cart: one each, on both builds. Either the group-A phase closed it or the audit counted
something else. Not acted on, and not claimed as closed.

### Two measurement traps, both nearly reported as results
The base-build capture tapped the NFC panel on the **current** server and then photographed
the **pre-audit** one. A tap token is a session on one origin only, so all 24 baseline
captures were the "Tap NFC Again" guard page — a complete, plausible-looking baseline of
nothing. `capture.cjs` now derives the tap URL from the server under test.

The contrast probe read the first non-transparent background it found and called
`rgba(255, 255, 255, 0.043)` white, reporting 1:1 for text that actually renders at 19:1.
The guest portal stacks translucent whites on near-black; the backdrop has to be composited
down the ancestor chain before the ratio means anything.

Wakes since commit: 0.

## Phase: uiux-D-states-and-dead-ends (5 October 2026) — Full

Owner: "now continue with group D". The empty states, the error pages and the screens that
describe a situation they are not in. ST-1 is a blocker and the artifact calls it the
highest-value single change in the audit.

### Acceptance criteria
- [x] D1 The guest's second job no longer dead-ends. On an installation with no services
      listed, the screen promised "housekeeping, room amenities, maintenance assistance and
      thoughtful add-ons", badged the location a green AVAILABLE, and then said "No services
      found — try another category or clear your search" with no category chosen, no search
      typed and no other control on the screen. It now says the hotel has not listed any
      services here, badges the location "Nothing listed", and offers the one thing that
      does work: Contact the front desk. Photographed in both states, from the same
      database, before and after.
      by artifact: `.flow/uiux/2026-10-02/applied/D-d01-service-deadend-before--mobile--light.png`
      and `.flow/uiux/2026-10-02/applied/D-d01-service--mobile--light.png`
      from: UIUX-2026-10-02 § States and feedback — ST-1 (BLOCKER)
- [x] D2 Nothing renders Next's unstyled 404 any more. The app had no `not-found.tsx` and
      no `error.tsx` anywhere, so fifteen guest routes and the whole console dropped out of
      a branded product onto a white "404 — This page could not be found." with no way
      back. Four boundaries now: a guest 404 and error inside the dark portal, a console
      404 and error that keep the sidebar and offer the board. Driven from a browser with a
      tapped NFC session: a bad guide section and a bad order code both return **404 with
      the guest boundary**; an unmatched path returns **404 with the root boundary**, which
      reads the path and offers the guest's doors or the staff's.
      by artifact: `.flow/uiux/2026-10-02/applied/D-measured.json`,
      `.flow/uiux/2026-10-02/applied/D-d03-notfound-before--mobile--light.png`
      from: UIUX-2026-10-02 § States and feedback — ST-2
- [x] D3 One empty-state rule instead of two vocabularies. The product writes "No <thing>
      found" on 20 screens and "No <thing> yet" on 35, and chooses between them by habit:
      "found" reports on a query, "yet" reports on the world, and only one of them is ever
      true. Six screens then added "Try changing your search or filter" whether or not
      anything was filtered. `src/lib/empty-state.ts` decides, with 8 tests, and all six —
      orders, the guest menu, inventory's two tables, NFC tags, the hotel guide — go
      through it. A filter cannot hide what was never there, so an empty collection always
      reports on the world. Blaming lines left in the product: **6 -> 0**.
      by test: `src/lib/empty-state.test.ts`
      from: UIUX-2026-10-02 § States and feedback — ST-7, § Content and copy — CP-9
- [x] D4 The verify screen stops offering an action that cannot work. A lockout, a device
      limit and a missing stay all appeared above a live, enabled passcode form: the screen
      said "contact the front desk" and then offered "Authorize Device". `passcodeIsBlocking`
      classifies the six failures, with 6 tests covering each and the unknown case, and a
      blocking failure replaces the form with the front desk. **The screen itself could not
      be reached in the disposable environment** — the only room-bound tag has no scan
      secret, so every route to it answers `nfc-access-denied?reason=bad-secret`. Source
      change and rule are proven; the rendering is not.
      by test: `src/lib/guest-passcode-messages.test.ts`
      from: UIUX-2026-10-02 § States and feedback — ST-3, § Content and copy — CP-8
- [x] D5 The analytics donuts stop drawing charts out of zeroes. With nothing to chart they
      drew the ring anyway — a grey circle around a centred 0 — listed every series at 0
      beside it, and tucked "No chart data yet." underneath as a sixth line. Three of those
      on one screen made a fresh install look like a business that had failed rather than
      one that had not started. Nothing to chart now draws nothing.
      from: UIUX-2026-10-02 § States and feedback — ST-6
- [x] D6 The realtime boards say how old they are. Both carried a manual Refresh and never
      said when anything was read, so a quiet shift and a dead socket looked identical. The
      timestamp is produced by the server on every render, so a realtime refresh updates it
      exactly as a manual one does; the wording is `describeAge`, with 5 tests including a
      backwards clock and a non-finite input.
      by test: `src/lib/loaded-at.test.ts`
      from: UIUX-2026-10-02 § States and feedback — ST-8
- [x] D7 The requests board stops reserving a screen for nothing and stops blaming a filter
      that is not set. Each lane had a 560px floor and an empty one said "**Matching**
      service requests will appear in this lane" on a board whose search was empty and
      whose status was All. The floor applies only to a lane holding cards; an empty lane
      is one line, and it says "matching" only when something is being matched.
      by artifact: `.flow/uiux/2026-10-02/applied/D-d04-staff-requests--desktop--light.png`
      from: UIUX-2026-10-02 § States and feedback — ST-9
- [x] D8 Machine stage green: `tsc --noEmit` clean, **257 tests** pass across 26 files (19
      new), the production build compiles, 24/24 routes HTTP 200 on both servers. Measured
      across the 24 captures, pre-audit build to current: radius-bearing elements
      **1,221 -> 45** (all `9999px` dots), distinct radius values **141 -> 3**, elements
      above weight 600 **1,143 -> 0**, total document height **45,393 -> 43,890px**.
      by artifact: `.flow/uiux/2026-10-02/applied/D-manifest.json`

### Two findings that did not survive contact
`ST-4` says three staff screens report zero guest stays while the portal shows a named
guest. The database settles it: **0 guest stays, 0 guest members, 31 orders**. An order
carries a guest's typed name, not a checked-in stay, so the staff screens were right and
the audit compared two different things. What was wrong was the wording — "No guest stays
match the current filters" with no filters set — and that is fixed with the rest of D3.

`ST-5` says three of four accounts report a broken permission state in developer shorthand.
Signed in as each of HOTEL_ADMIN, STAFF and KITCHEN across four console routes: **zero
shorthand strings** in the rendered text of any of the twelve. What those accounts do get
is a silent redirect — STAFF asking for `/dashboard/guest-stays` lands on `/dashboard`,
KITCHEN asking for `/dashboard/orders` lands on `/dashboard/kitchen` — with no word about
why. That is a real defect and a different one; it is recorded here, not fixed, because
naming it is a navigation decision and group E is the owner's.

### Something changed the database mid-phase
Twelve service catalog items appeared at 13:16 local, four minutes after the capture that
photographed the dead end, created by the product's own "Add Default Services" staff
action. I did not invoke it knowingly and cannot identify what did. It matters because it
would have made the blocker unreproducible; the before capture was already taken, and the
fix's empty branch was then photographed by clearing the catalog from the disposable
database, which is what that database is for.

### A third measurement trap
`curl` reports 307 for every `/t/...` path, because the NFC guard runs before the route. A
plain curl test therefore "proved" that the guest 404 boundary never fired, when what it
had actually measured was the guard redirecting a client with no NFC cookies. From a
browser that has tapped the panel, the guest boundary serves a real 404.

Wakes since commit: 0.

## Fix: the Services module's stretched action (5 October 2026) — Quick

Owner, with a screenshot: "Can you fix this?" A regression from
`uiux-C2b-remaining-heroes`, found by looking at the running product rather than by any
check in this file.

Removing that module's hero emptied the first cell of a two-column grid but left the grid
standing, and a grid child stretches to the row: the one surviving action became a
**350px-tall filled black slab**, right-aligned in a column of nothing, matching the
height of the panel beside it. Every gate was green — tsc, 257 tests, a clean build, one
`<h1>`, no radii, no weight above 600 — because none of them can see a button the size of
a poster.

- [x] X1 The action is a control again: a plain right-aligned button above the content,
      outside any grid.
- [x] X2 The dead column is gone. The setup helper that occupied the other cell is one
      hairline row — the sentence on the left, the hotel select and the button on the
      right — instead of a filled gold card carrying its own icon tile and a nested tip
      box. The tip is now the second half of the sentence.
- [x] X3 The same pattern was checked in the four other modules de-heroed in that phase:
      rewards, backups, NFC tags and the dashboard home. Backups and tags put their lifted
      action in a plain `div`, not a grid cell, so they are unaffected; rewards' grid has
      two real children; the home has no such grid. Services was the only one.

The lesson is the one C8 already recorded in the group-C phase and it has now cost twice:
a layout can be numerically perfect and visibly broken, and only the capture shows it.
The de-hero passes removed containers without checking what the surviving children were
children *of*.

Wakes since commit: 0.

Deployed (5 Oct 2026, ~14:30 Manila): owner said "now push and deploy it". `main` pushed
`2c7e5eb..1cf9887` — ten commits, the whole UI/UX redesign: the audit, groups A, B, C and
D, the class sweep and the Services regression fix. `deploy/deploy.sh` on the VPS, dry run
first, resolving `.env.production.local -> @srv2093.hstgr.io:3306/u610581005_cloudviewdb`
(the real database, not the local decoy). **No migration and no dependency change in this
release** — `prisma/migrations`, `prisma/schema.prisma`, `package.json` and
`package-lock.json` are all untouched between the two commits — so `migrate deploy` was a
no-op and `npm ci` did not run. Built under nvm's Node 22; `pm2 reload cloudview-nextjs`;
health check `http://127.0.0.1:3000/dashboard/login` 200.

Proven live on the public domain rather than on localhost:
`https://cloudhotelph.com/nothing-at-all` returns **404 with "There is nothing at this
address"**, the root boundary added in group D, which did not exist in `5446cab` — that
path previously served Next's own white 404. All three self-hosted faces load:
EBGaramond_Variable (44,336B), EBGaramond_Italic_Variable (47,940B) and
InstrumentSans_Variable (30,092B), each 200.

Still true of the two recorded deploy traps: the server's `~/.ssh/config` still points
`github.com` at `id_ed25519`, so the pull needs
`GIT_SSH_COMMAND="ssh -i ~/.ssh/cloudview_github -o IdentitiesOnly=yes"`; and `deploy.sh`
still needs `~/.nvm/nvm.sh` sourced, because the system Node is 18.19.1 and the build
requires 20.9+. Neither was fixed on the server by this deploy. A third to add: the script
is not executable in the checkout, so it runs as `bash ./deploy/deploy.sh`, not `./`.

Nothing was backed up beforehand and nothing needed to be: this release does not touch the
schema or any row. The guest-facing change is large and visual, so the thing to watch is
guests and staff reacting to the new layouts, not data.

Wakes since commit: 0.

## Phase: uiux-E-navigation-and-vocabulary (5 October 2026) — Full

Owner: "now continue with group E". The group the audit sealed — *"this group changes
shape, so all of it is in the decisions below and none of it moves without your answer."*
The answers were taken before any of it was written, and all four were the recommendation.

### The four answers
1. **Sidebar — regroup and rename.** 2. **Guest tabs — merge `/orders` and `/activity`
into "My stay".** 3. **Vocabulary — standardise both surfaces.** 4. **Kitchen — leave as
is**, since group C already made the readable layout the default; decision 5 is closed by
that rather than by TV Mode.

### Acceptance criteria
- [x] E1 The menu describes the work, not the system. Five groups named after subsystems —
      Dashboard, Hotel Setup, Guest Service, Sales & Stock — became four named after spans
      of attention: **Today** (overview, orders, kitchen, service requests, counter sales),
      **The hotel**, **What we sell**, **Records**. Taking counter money, which IA-10 found
      split across two groups with nothing linking them, now sits in Today beside the
      orders it belongs with. Three labels renamed in the one table that feeds the sidebar,
      the mobile bar and the permissions screen: Services Module → **Services**, POS
      Terminal → **Counter sales**, Hotel Guide → **Hotel guide**. The counter screen had
      three names on it at once — menu item, eyebrow and heading — and now has one.
      by artifact: `.flow/uiux/2026-10-02/applied/E-e04-sidebar--desktop--light.png`
      from: UIUX-2026-10-02 § Information architecture — IA-1, IA-10
- [x] E2 The sidebar admits it scrolls. It had `scrollbar-width: none` and a hidden webkit
      scrollbar, so opening a group pushed up to six items out of sight with nothing on
      screen saying the list continued. A 6px rule in the accent at 35% is the cue.
      from: UIUX-2026-10-02 § Information architecture — IA-2
- [x] E3 The mobile bar finds the page you are on. It marked the active item correctly all
      along — the pill was never scrolled into view, so on a phone you saw the first five
      of nineteen and none of them was where you were. It centres the marked one whenever
      it changes. Its active pill also stopped being a gradient with a glow.
      from: UIUX-2026-10-02 § Information architecture — IA-3
- [x] E4 `/orders` and `/activity` were the same list twice, and the guest's own navigation
      reached neither. `/activity` holds a stay — current orders, current requests and the
      history of both — so it became **My stay**, got the shell and the tab bar it never
      had, and is the fourth tab's destination. `/orders` is a redirect, not a deletion:
      the audit promised no route would be removed, so printed QR codes and old links keep
      working. The hub on the contact screen collapsed from two rows to one.
      by artifact: `.flow/uiux/2026-10-02/applied/E-e01-mystay--mobile--light.png`
      from: UIUX-2026-10-02 § Information architecture — IA-5, IA-6, IA-7
- [x] E5 The tab bar stops lying about where you are. The resolver's last line was
      `return 'home'`, so any route it did not recognise — requests, track, support,
      activity — told the guest they were on the home screen. Every guest route is now
      accounted for and an unrecognised one marks nothing. The compiler found six screens
      declaring `active="profile"`, two of which (`/guide`, `/pool`) were not even in that
      part of the product.
      from: UIUX-2026-10-02 § Information architecture — IA-5
- [x] E6 One destination, one name. A tab called "Profile" opened a shell titled "Profile"
      above an eyebrow reading "Private guest profile" above a heading reading "My Stay" —
      four names for one screen, and "My Stay" is a different screen now. The tab is **My
      stay** and goes to the stay; that screen is **Contact the hotel** and does that.
      from: UIUX-2026-10-02 § Information architecture — IA-12
- [x] E7 One word per concept, where the words were genuinely duplicates. The third order
      stage was called three things — the kitchen's lane said "Serving", its button said
      "Serving", the board said "READY" and the guest saw "Ready" — and is now **Ready**
      everywhere. "Payment pending" became **Unpaid**, which the badge beside it already
      said. The staff surface called the sticker on the wall an "NFC tag" 58 times and an
      "NFC card" three times; now only the first.
      from: UIUX-2026-10-02 § Information architecture — IA-4, § Content and copy — CP-4, CP-13
- [x] E8 The sign-in screen stopped selling the product to the person signing in. Half of
      it was a 48px slogan, a sentence listing the modules and three tiles explaining
      role-based access and protected sessions — to someone who already works there and is
      holding their password. "Welcome back", the greeting the brief bans by name, is
      **Sign in**. Gone with it: a three-stop gradient page background, a three-stop
      gradient on the submit button with a sweeping highlight over it, two fading gold
      rules around the words "Encrypted access", a shield on the button, and a chip reading
      CloudView with a sparkle on it directly above the word CloudView. The one line that
      says something — that access is logged — stays.
      by artifact: `.flow/uiux/2026-10-02/applied/E-e03-login-before--desktop--light.png`
      and `E-e03-login--desktop--light.png`
      from: UIUX-2026-10-02 § Content and copy — CP-2
- [x] E9 The last emoji in the product's chrome. A cloud stood in for a hotel that has not
      uploaded a logo — the vendor's brand on a screen meant to be the hotel's. It is the
      hotel's own initials now.
- [x] E10 Machine stage green: `tsc --noEmit` clean, 257 tests pass, the production build
      compiles, 13/13 routes HTTP 200 on both servers. Measured across the 13 captures,
      pre-audit build to current: radius-bearing elements **823 -> 0**, elements above
      weight 600 **869 -> 0**, document height **24,087 -> 22,140px**. The console with its
      sidebar is 2,622 -> 2,242px at desktop and 6,686 -> 5,663px on a phone.
      by artifact: `.flow/uiux/2026-10-02/applied/E-manifest.json`

### Where the proposal was wrong, and what was done instead
The vocabulary question was put to the owner as "'not paid yet' is written five ways". On
inspection two of those five are not synonyms: **Not billed** means the hotel has not added
a charge to the folio, and **Pay at counter** is a payment method. Only "Payment pending"
was a true duplicate of Unpaid. Flattening the other two would have destroyed a real
distinction, so they were left and only their casing was normalised.

The same applies to the sticker: the staff surface says "NFC tag" and the guest surface
says "NFC panel". That is a register difference, not an inconsistency — a guest does not
know what a tag is — so the guest keeps "panel" deliberately.

### Left open
`IA-8` (the Wi-Fi password has three answers, two of them 450px apart), `IA-9` ("service"
names nine things in the portal), `IA-11` ("available" is a flag on one screen and a count
on another), and `CP-3`, `CP-5`, `CP-6`, `CP-7`, `CP-10`, `CP-11`, `CP-14`. These are the
remaining vocabulary findings, and each is a content decision about a word the product uses
dozens of times rather than a defect with one site. They want the same treatment this phase
gave the order stage — one word, chosen deliberately, applied everywhere — and that is a
sitting with the owner and a word list, not a pass by the loop.

Wakes since commit: 0.

Deployed (5 Oct 2026, ~15:10 Manila): owner said "deploy". `main` pushed
`69a55eb..b344587`, one commit. Same route as the last one: dry run first, resolving
`.env.production.local -> @srv2093.hstgr.io:3306/u610581005_cloudviewdb`; **no migration
and no dependency change** between the two commits, so `migrate deploy` was a no-op and
`npm ci` did not run; built under nvm's Node 22; `pm2 reload cloudview-nextjs`; health
check 200. The server reports `b344587` and the process is online on its 34th restart.

Proven on the public domain by four strings flipping at once on
`https://cloudhotelph.com/dashboard/login`: **"Welcome back" 1 -> 0**, **"Encrypted
access" 1 -> 0**, **"Secure sign in" 1 -> 0**, **`linear-gradient` 3 -> 0**, with "Sign
in" and "Use the account the hotel issued you" now present. Smoke check: `/` 200,
`/dashboard/login` 200, `/nothing-at-all` 404 with the branded boundary,
`/nfc-access-denied` 200.

**All five groups of the UI/UX audit are now applied and in production.** What remains of
the audit is the ten vocabulary findings listed above, which need the owner's word list,
and the handful of VH items recorded as partial.

Wakes since commit: 0.

## Phase: xendit-refund-retry-loop (6 October 2026) — Full

Owner, with a screenshot of the notification centre: "can you fix the xendit webhooks, or
anything in the payment integration, it does repeatedly give me notifications like this".

### What was actually happening
Read from production, read-only, before changing anything: **six failed refunds. Four are
parked correctly** as `MANUAL REFUND REQUIRED` (QR Ph) and generate no noise. **Two of
₱50.00 each had been failing for 1,942 hours — eighty-one days**, with the same answer
every time:

    Xendit 400: REFUND_NOT_SUPPORTED — Refund request failed because refunds are not
    supported for this channel

The worker polls every five minutes. Each pass set the row to PENDING and announced
"Refund Processing", called Xendit, caught the same 400, set FAILED and announced "Refund
Failed". Two rows × two notifications × 12/hour × 81 days is on the order of **ninety
thousand notifications**, and neither guest's ₱50 ever moved.

The mechanism to prevent this already existed and worked — those four QR Ph rows prove it.
But `MANUAL REFUND REQUIRED` was only ever written by `getManualRefundRequiredMessage()`,
which checks `session.paymentSourceType` **before** the call against a hardcoded set. When
the channel is only revealed by Xendit's reply, nothing read the reply. So the identical
condition was parked in one case and retried for ever in the other.

### Acceptance criteria
- [x] X1 A new rule reads what Xendit returned. `isPermanentXenditRefundError` recognises
      the six answers that cannot change — REFUND_NOT_SUPPORTED, CHANNEL_NOT_SUPPORTED,
      INVALID_PAYMENT_STATUS, PAYMENT_NOT_FOUND, REFUND_AMOUNT_EXCEEDED, REFUND_NOT_ALLOWED
      — in any wrapping, and treats a timeout, a 5xx, a rate limit or anything unrecognised
      as retryable. The bias is deliberate: parking means a guest's money waits for a
      human, so an unknown error gets another go. by test: `src/lib/xendit-refund-retry.test.ts`
- [x] X2 The deadline, not the classifier, is what guarantees termination. A transient
      failure is retried no more often than every **30 minutes**, and after **24 hours**
      from its *first request* it is parked for a person. Counted from `requestedAt`, never
      from `updatedAt`, because retrying writes `updatedAt` and a deadline measured from it
      could never arrive. This alone would have caught the two in a day without anyone
      knowing the Xendit code in advance. by test: same file
- [x] X3 Run against the exact strings read out of production: the two noisy refunds →
      **PARK**, the four QR Ph ones → **SKIP** (unchanged), a fresh timeout → **WAIT**, an
      unclassified error three days old → **PARK**. The two existing rows therefore heal
      themselves on the first pass after deploy; no data migration.
- [x] X4 A permanent answer caught during a retry is promoted to the manual-review message
      at the point of failure too, so a new one is parked the first time rather than
      entering the loop at all.
- [x] X5 The retry itself stopped announcing. Setting a row to PENDING to begin an attempt
      said "Refund Processing" to the whole dashboard — an internal transition, not news,
      and half of all the noise. Parking announces **once**, because after that write the
      refund is skipped on every future pass and the worker will never mention it again.
- [x] X6 One definition of `MANUAL REFUND REQUIRED:`. It was declared separately in the
      library and in the route, which is how the two could ever have disagreed.
- [x] X7 Machine stage green: `tsc --noEmit` clean, **268 tests** pass (11 new), the
      production build compiles. No migration, no schema change, no dependency change.

### What this does not do
It does not return the two guests their ₱50. It cannot: Xendit will not refund that
channel through its API, which is what it has been saying for eighty-one days. The fix
makes the product say so once, clearly, on the order where staff will see it, instead of
hiding it inside a flood. **Someone still has to settle ₱100 with two guests by hand**, and
the parked message now says exactly that.

### Worth noticing
Every gate was green throughout those eighty-one days. There is no test that fails when a
worker retries the same doomed request nine thousand times, and no alert on notification
volume. The thing that found it was the owner looking at their own notification centre.

Wakes since commit: 0.

Deployed (6 October 2026, ~Manila): owner said "push and deploy". `main` pushed
`c7a1146..382989d`, one commit. Dry run first; `.env.production.local ->
@srv2093.hstgr.io:3306/u610581005_cloudviewdb`; no migration, no dependency change; built
under nvm's Node 22; `pm2 reload cloudview-nextjs`; health check 200.

**Proven on production data, not by assertion.** One retry pass was triggered by hand
against the live endpoint immediately after the reload. It answered
`{"parked": 6, "retried": 0}` — up from four parked and two retried — and reading the rows
back shows all six `FAILED` refunds now carrying the `MANUAL REFUND REQUIRED:` prefix,
with the two ₱50.00 ones reading "Xendit reported that this payment cannot be refunded
through its API". They are skipped on every future pass. **The loop is closed: those two
rows will not produce another notification.**

Still outstanding, and not something code can do: **₱100 is owed to two guests** and has
to be settled by hand. The amount and the reason are on the order for staff to act on.

Worth doing next, cheaply: an alert on retry volume for a single record. Nothing in the
product would have noticed this, and the next doomed background job will look exactly the
same from the inside.

Wakes since commit: 0.

## Correction to the phase above

**"Roughly ninety thousand notifications" is wrong — by about three orders of magnitude.**
It is written into the commit message of `382989d` and into the record above, and it was
arithmetic from the worker's five-minute interval rather than anything measured.

`createUniqueNotification` suppresses an identical notification — same hotel, type, title
and message — for **twelve hours**. So the loop produced at most two rows per refund per
twelve hours, not two every five minutes. Counted on production: **217 refund notification
rows across 15 distinct messages**, of which the four belonging to the two stuck refunds
hold 52, 52, 51 and 51 occurrences. Roughly **eight notifications a day**, 217 in total.

The defect and the fix are unchanged. The characterisation was wrong, and the wrong figure
is the one that made it into a permanent record.

## Phase: stuck-work-alert (6 October 2026) — Full

Owner: "yes add the alert", after the refund loop.

### The first design was wrong, and the real data said so
The obvious instrument was the notification table: a looping job must be shouting, so
watch for the same message coming back day after day. A rule was written and tested that
way — group by exact text, require N occurrences spanning H hours, require recent
activity so a fixed problem stops being reported.

Then it was replayed against the real production history, 289 rows exported and run
day by day. **It first fires on day 58 of 82.** Every threshold pair from three
occurrences upward gave the same answer — 58, 59 or 60 — with zero false alarms, which
means the thresholds were never the constraint. The twelve-hour dedupe is: it made the
notifications sparse, so watching them measures how *loud* a failure is, not how *long*
it has been failing. The two refunds announced themselves roughly three times in the
first 58 days.

That approach was deleted rather than tuned. What was continuous was never the
announcements — it was the work. A row sat in a failed, retryable state for 1,942 hours
and was visible in its own table the entire time.

### Acceptance criteria
- [x] A1 The rule reads the work, not the announcements: anything still waiting to
      succeed after **24 hours** is a fault rather than a hiccup. Replayed against the
      real fault hour by hour, it fires on **day 2** instead of day 58.
      by test: `src/lib/stalled-work-alert.test.ts`
- [x] A2 It is about the shape of the problem, not the type of record, so it covers work
      nobody has thought about yet. The scan currently gathers unparked failed refunds
      and long-pending payment sessions; adding a kind is a query in one place rather
      than instrumentation inside a worker. The next doomed job will not be a refund and
      whoever writes it will not add a counter.
- [x] A3 It is silent when the product is healthy. Parked refunds are waiting for a
      person, not stuck, so they are skipped — against production's current state (six
      refunds, all parked; zero pending sessions) the scan raises **zero** alerts, which
      matters because an alert that greets its own deployment with a burst is the noise
      this whole exercise is removing.
- [x] A4 When it does fire it says the thing nobody could see: *"A refund for
      CVDHSE000001 has been retrying for 81 days without succeeding, and will not fix
      itself. ₱50.00 has not gone back to the guest."* The age is in the title too, and it
      is its own notification type so the twelve-hour dedupe on the underlying failure
      cannot swallow it.
- [x] A5 Machine stage green: `tsc --noEmit` clean, **277 tests** pass, the production
      build compiles in 74s. No migration, no schema change, no dependency change.

### What this still does not cover
Work that fails without writing a row anywhere — a crashed worker, a cron that stopped
being scheduled, an outbound call nobody records. This watches state that exists; it
cannot watch for the absence of state. A heartbeat per worker would, and is a separate
piece of work.

Wakes since commit: 0.
