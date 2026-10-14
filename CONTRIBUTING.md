# Contributing

Thanks for helping out. Dunder Mifflin OS is a small, test-first TypeScript project; the notes below keep it that way.

## Setup

You need Node 22.13 or newer.

```sh
npm install
npm run demo        # the demo day ("Threat Level Midnight"), no keys or Hermes: http://127.0.0.1:4318
npm run demo:server # the server on recorded, redacted fixture data, plus the web app
```

`npm run dev` runs the server against a real `~/.hermes` (read-only) if you have Hermes.

## Checks

Run these before you open a pull request; CI runs the same:

```sh
npm run typecheck
npm test           # vitest: web, shared and server
npm run e2e        # Playwright against mocked APIs
npm run e2e:auth   # Playwright sign-in against the real server (fixture data)
```

## How we work

- **Tests first.** Write a failing test (vitest for logic, Playwright for user flows), make it pass, then tidy up.
- **Small files and functions.** Aim for files under 400 lines and functions under 50.
- **Immutable data.** Return new objects instead of changing the ones you were given.
- **Validate at the edges.** Everything from Hermes, the network or the browser is untrusted until a guard accepts it.
- **Security defaults stay on.** Loopback bind, read-only unless `DMOS_ALLOW_WRITES=1`, a token for remote access.
  A change that weakens one of these needs a strong reason and an update to `SECURITY.md`.
- **The contract is shared.** `shared/contract.ts` is used by both the server and the browser. Keep changes additive
  and call them out in the pull request.

## Commits and pull requests

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`.
- One topic per pull request. Describe what changed, why, and how you tested it.

## What must never be committed

- Secrets: tokens, API keys, `.env` files, chat ids.
- Real Hermes data: task titles, messages, job names, screenshots of a live office. Fixtures are recorded and then
  redacted with `server/scripts/redact.ts`.
- Personal details: home-directory paths, host names, email addresses, customer or client names.
- Photos of anyone, and anything taken from the show: logos, stills, screenshots, audio. The drawn characters are
  original art (see `ASSETS-LICENSE`); keep new art original too.

## Licences

By contributing you agree that your code is released under the MIT License (`LICENSE`) and your original artwork
and map data under CC BY 4.0 (`ASSETS-LICENSE`).

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately as described in
[SECURITY.md](SECURITY.md).
