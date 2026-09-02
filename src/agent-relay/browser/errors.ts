import type { RelayFailure } from "../contracts";

export class RelayBrowserError extends Error {
  readonly code: RelayFailure["code"];

  constructor(code: RelayFailure["code"], message: string) {
    super(message);
    this.name = "RelayBrowserError";
    this.code = code;
  }
}

export function relayAbortError(reason: unknown = "Relay execution cancelled"): DOMException {
  if (reason instanceof DOMException && reason.name === "AbortError") return reason;
  return new DOMException(typeof reason === "string" ? reason : "Relay execution cancelled", "AbortError");
}

export function safeRelayErrorMessage(error: unknown): string {
  if (error instanceof RelayBrowserError) return `${error.code}: ${error.message}`;
  if (error instanceof DOMException && error.name === "AbortError") return "Relay execution cancelled.";
  return "The managed Relay could not safely complete this attempt.";
}
