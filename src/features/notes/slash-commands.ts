export const slashCommands = [
  "Text", "Heading 1", "Heading 2", "Heading 3", "Bulleted list", "Numbered list", "To-do list", "Quote", "Code block", "Attachment",
] as const;
export type SlashCommand = typeof slashCommands[number];
const aliases: Record<SlashCommand, string[]> = {
  "Text": ["paragraph"], "Heading 1": ["h1"], "Heading 2": ["h2"], "Heading 3": ["h3"],
  "Bulleted list": ["bullet"], "Numbered list": ["ordered"], "To-do list": ["todo", "check", "checklist"],
  "Quote": ["blockquote"], "Code block": ["code"], "Attachment": ["file", "attach", "upload"],
};
export function filterSlashCommands(query: string) {
  const term = query.trim().toLowerCase();
  return slashCommands.filter((item) => [item.toLowerCase(), ...item.toLowerCase().split(/[\s-]+/), ...aliases[item]].some((word) => word.startsWith(term)));
}
