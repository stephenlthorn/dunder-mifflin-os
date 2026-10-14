## What and why

<!-- What does this change, and why? Link the issue if there is one. -->

## How I tested it

<!-- Tests added first, and what you ran: npm run typecheck, npm test, npm run e2e, npm run e2e:auth, manual checks. -->

## Checklist

- [ ] Tests written first and passing (`npm test`, `npm run e2e`)
- [ ] `npm run typecheck` is clean
- [ ] No secrets, real Hermes data, personal paths, host names, emails or customer names
- [ ] No photos or show assets (logos, stills, audio); new art is original
- [ ] Safe defaults kept (loopback bind, read-only unless `DMOS_ALLOW_WRITES=1`, token for remote access)
- [ ] `shared/contract.ts` changes are additive and called out above
- [ ] README / SECURITY.md updated if behaviour or settings changed
