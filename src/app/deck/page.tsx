import type { Metadata } from "next";

import { RatiflowDeck } from "./RatiflowDeck";

export const metadata: Metadata = {
  title: "Ratiflow · WebMCP product demo",
  description:
    "A 12-slide product demo showing how Ratiflow turns an explicit assignment access grant into scoped, reversible agent work.",
};

export default function RatiflowDeckPage() {
  return <RatiflowDeck />;
}
