# Stage 1 — Capture · 2 October 2026

141 screen captures of CloudView as built, from a **disposable instance** — no production
data at any point.

## The environment

| | |
|---|---|
| Code | `origin/main` @ `2c7e5eb`, production build (`next build`, Turbopack), served by pm2 on `127.0.0.1:3007` |
| Database | A freshly initialised MySQL 8.4 on `127.0.0.1:3399`, schema from `prisma db push`, content from `prisma/seed.ts` plus the product's own "Load starter guide" action |
| Browser | Chrome via playwright-core, device scale 2, full-page |
| Widths | Desktop 1440×900, mobile 390×844 |
| Themes | Light and dark (`localStorage['cloudview-theme']`) |

Demo volumes, honestly small: 4 menu products, 4 guide sections / 6 items / 0 photographs,
7 food orders, 0 hotel services, 0 service requests, 2 guest stays, 2 NFC tags, 1 hotel.
Several screens are therefore showing the genuine day-one empty state of a new property,
which turned out to be the most useful evidence in the set.

## What was captured

- **Guest portal** — 18 captures (16 routes plus the cart drawer open and the guide with a
  live search). Desktop + mobile in light, mobile in dark.
- **Staff dashboard** — 21 captures (19 routes plus the order-details modal and the
  orders list filtered to nothing). Desktop + mobile in light, desktop in dark.
- **Edge** — 6: dashboard login, public landing page, NFC access denied, room-passcode
  verify, and the two Xendit payment returns.

Files: `D:/_ultra/uiux/shots/*.png`, index in `files.txt`, measurements in `manifest.json`,
one-line-per-route summary in `digest.txt`.

## Measured, not judged

Per capture the harness recorded: HTTP status, every visible heading in order, the distinct
corner radii and how many elements carry each, distinct text colours, font families and
weights with element counts, elements carrying a backdrop blur / a gradient background / a
shadow blur ≥24px, every interactive element under 44px with its pixel size, images without
alt text, document height and the first 400 characters of visible text.

The totals that matter, across `src/`:

| | |
|---|---|
| `rounded-*` class occurrences | 1,996 (`rounded-2xl` 714, `rounded-full` 506, `rounded-xl` 230, `rounded-[2rem]` 145, `rounded-3xl` 57) |
| `font-black` occurrences | 1,481 |
| `shadow-soft` (a 60px drop shadow) | 17 |
| `backdrop-blur` | 130 |
| `bg-gradient-*` | 39 |
| `active:scale-*` | 70 |
| Webfonts loaded | **none** — the product renders in `ui-sans-serif` / `system-ui` |
| Emoji in interface chrome | **exactly one** — `☁` at `src/components/guest/GuestShell.tsx:55`, the brand mark on the order-tracking screen, where every other guest screen uses the "CV" monogram. (An earlier Unicode grep in this environment reported zero; a plain search finds it. The content lens caught it by looking.) |
| Distinct corner radii on one screen | 7–9 on most dashboard screens; 14 on the landing page |
| Distinct text colours on one screen | 15–28 on dashboard screens |
| Elements at font-weight 900 on one screen | 55–192 |

## Two routes could not be reached

| Route | Why |
|---|---|
| `g04-payment` | `/t/<tag>/payment` 404s without a live Xendit payment session; no sandbox credentials exist. |
| `g10-service-thx` | `/t/<tag>/service/thanks` 404s without a submitted service request, and the seed ships no services to request. |

Both are recorded as *not established*, not as findings. The bare Next.js 404 a guest lands
on in both cases **is** a finding, and is raised by the states lens.

## A capture artefact to know about

The guest bottom navigation and some dashboard bars are `position: fixed`. In a full-page
screenshot a fixed element is painted once, at its viewport position, so it appears partway
down the image and overlaps content. That overlap is an artefact of the capture, not a
defect in the product. The redesign mockups make the same bar static so the captures compare
like with like.
