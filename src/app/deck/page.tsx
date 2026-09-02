import type { Metadata } from "next";

import { RatiflowDeck } from "./RatiflowDeck";

export const metadata: Metadata = {
  title: "Ratiflow · The document is the agent runtime",
  description:
    "A 12-slide WebMCP Challenge deck showing how Ratiflow turns an @mention into a scoped, reversible agent transaction.",
};

export default function RatiflowDeckPage() {
  return <RatiflowDeck />;
}
