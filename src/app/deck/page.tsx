import type { Metadata } from "next";

import { RatiflowDeck } from "./RatiflowDeck";

export const metadata: Metadata = {
  title: "Ratiflow · WebMCP product demo",
  description:
    "A 12-slide product demo showing how Ratiflow turns an @mention into scoped, reversible agent work.",
};

export default function RatiflowDeckPage() {
  return <RatiflowDeck />;
}
