// Last line of defence for FREE TEXT that leaves the server (chat messages, task titles, activity, job names):
// bots sometimes quote chat ids, ~/.hermes paths, tokens or phone numbers. Order matters (paths before ~ rewrite,
// tokens before digit runs). Ids and timestamps are structured fields and never pass through here.

const PATH_END = String.raw`[^\s'"\`<>()\[\]{},;]*[^\s'"\`<>()\[\]{},;.:!?]`;

const RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // secrets first, so their digits are not half-masked by the rules below
  [/\b\d{8,10}:[A-Za-z0-9_-]{30,}/g, '[secret]'], // Telegram bot token
  [/\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_\w{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[\w-]{30,}|AKIA[0-9A-Z]{16})/g, '[secret]'],
  [/\b(Bearer)\s+[\w.-]{16,}/gi, '$1 [secret]'],
  // ~/.hermes, $HOME/.hermes, /Users/x/.hermes, .hermes/... (with whatever path follows)
  [new RegExp(String.raw`(?:~|\$HOME|/Users/[^\s/]+|/home/[^\s/]+)?/?\.hermes\b(?:/${PATH_END})?`, 'gi'), '[hermes path]'],
  [/\/(?:Users|home)\/[^\s/'"`]+/g, '~'],
  // phone numbers: international (+…) and US style
  [/\+\d[\d\s().-]{7,}\d/g, '[phone]'],
  [/(?<!\d)\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/g, '[phone]'],
  // Telegram chat/user ids and other long digit runs (not inside hex-ish words)
  [/(?<![\dA-Za-z])-?\d{9,}(?![\dA-Za-z])/g, '[id]'],
];

export function scrubText(text: string): string {
  return RULES.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}
