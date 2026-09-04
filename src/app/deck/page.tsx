import type { Metadata } from "next";

import { RatiflowDeck } from "./RatiflowDeck";

export const metadata: Metadata = {
  title: "Ratiflow · WebMCP product demo",
  description:
    "An 11-slide product demo showing how Ratiflow preserves shared document history while giving each agent assignment-specific tools.",
};

export default function RatiflowDeckPage() {
  return <RatiflowDeck />;
}
