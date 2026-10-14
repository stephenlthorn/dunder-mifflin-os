#!/usr/bin/env node
// `npx dunder-mifflin-os`: the server is TypeScript, run through tsx (a runtime dependency) so the published package
// has the same layout as the repo. Everything else lives in server/src/cli/main.ts.
import { register } from 'tsx/esm/api';

register();
await import('../server/src/cli/main.ts');
