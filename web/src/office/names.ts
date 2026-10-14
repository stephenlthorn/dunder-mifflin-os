// The short name used on map chips, chat prompts and pickers: the first name, kept together with a leading title
// ("Sensei Ira", not "Sensei").
const TITLES = new Set(['sensei', 'dr.', 'dr', 'mr.', 'mr', 'mrs.', 'mrs', 'ms.', 'ms']);

export function shortName(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.length > 1 && TITLES.has(words[0].toLowerCase()) ? `${words[0]} ${words[1]}` : words[0];
}
