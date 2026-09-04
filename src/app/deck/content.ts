export const DECK_SLIDES = [
  {
    id: "slide-01",
    section: "PRODUCT DEMO",
    title: "Ratiflow",
    subtitle: "Turn @mentions into scoped, reversible agent work—inside the document.",
  },
  {
    id: "slide-02",
    section: "WHY IT EXISTS",
    title: "Documents are becoming shared workspaces for people and agents.",
    subtitle: "Without a clear document history, context gets lost, decisions become confusing, and agents cannot do their best work.",
  },
  {
    id: "slide-03",
    section: "THE RATIFLOW MODEL",
    title: "One shared history. Different tools for each agent.",
    subtitle: "Every agent gets the same document history and provenance. Ratiflow then exposes only the tools allowed by company policy.",
  },
  {
    id: "slide-04",
    section: "LIVE DEMO",
    title: "Select text. Mention a bot. Assign & run.",
    subtitle: "In the Postmortem, select any safe passage, choose @Code, write the instruction, and run—no permission step.",
  },
  {
    id: "slide-05",
    section: "SCOPE & CONTROL",
    title: "The history is shared. Access is company policy.",
    subtitle: "Every agent gets the same document history and provenance. In this demo, hard-coded company policy maps @Code to Repository tools.",
  },
  {
    id: "slide-06",
    section: "CODE RESULT",
    title: "Code verifies the incident and rewrites only the selected section.",
    subtitle: "Repository evidence separates the trigger from the retry amplifier; the new replacement is green for 30 seconds and remains restorable.",
  },
  {
    id: "slide-07",
    section: "HISTORY & RESTORE",
    title: "Every agent change keeps its decision trail.",
    subtitle: "History keeps the asker, agent, runtime, evidence, revision lineage, and restore point attached to the document.",
  },
  {
    id: "slide-08",
    section: "WEBMCP DEPENDENCY",
    title: "Without WebMCP, managed execution stops safely.",
    subtitle: "The document and comments still work; dynamic discovery and the managed relay fail closed.",
  },
  {
    id: "slide-09",
    section: "HOW IT WORKS",
    title: "How a mention becomes a committed revision.",
    subtitle: "An agent running through an API composes each call; the browser discovers and executes WebMCP tools; Ratiflow enforces and records the result.",
  },
  {
    id: "slide-10",
    section: "NEXT FOR WEBMCP",
    title: "Two things WebMCP needs for real agent work.",
    subtitle: "Today, tool execution depends on a live page. The next step is keeping context current and approved work durable.",
  },
  {
    id: "slide-11",
    section: "TRY IT LIVE",
    title: "Try Ratiflow live.",
    subtitle: "See the full people-and-agents document workflow in the live app.",
  },
] as const;

export const DECK_SLIDE_COUNT = DECK_SLIDES.length;
