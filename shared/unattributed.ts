// Creed's corner ("Creed knows something"): activity the office can't put at anyone's desk. Served by
// GET /api/unattributed; additive to contract.ts. Every text is short and scrubbed on the server like any other
// display string, and agent ids are the adapter's own (never a chat id or a path).

export const UNATTRIBUTED_KINDS = ['agent', 'card', 'approval'] as const;
/** agent = an agent an adapter reports that has no desk; card = a card whose owner has no desk; approval = a request from one. */
export type UnattributedKind = (typeof UNATTRIBUTED_KINDS)[number];

export type UnattributedItem = {
  id: string; // 'agent:<adapter>/<agent>', 'card:<task id>', 'approval:<approval id>'
  kind: UnattributedKind;
  adapter?: string; // AdapterInfo.id, when known
  agentId?: string; // the agent as its adapter calls it
  title: string; // the agent's name, the card's title or the request
  detail: string; // why it is here, and its state
  at?: string; // ISO: when it last changed
};

export type UnattributedReport = { generatedAt: string; items: UnattributedItem[] };

export const MAX_UNATTRIBUTED = 50;
