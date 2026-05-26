export type PublishAttemptResult = {
  kind: "recipient" | "self";
  relay: string;
  result: PromiseSettledResult<unknown>;
};

export function assertPublishSucceeded(results: PublishAttemptResult[]): void {
  const recipientResults = results.filter((entry) => entry.kind === "recipient");
  const recipientSuccesses = recipientResults.filter(
    (entry) => entry.result.status === "fulfilled",
  );
  const recipientFailures = recipientResults.filter(
    (entry) => entry.result.status === "rejected",
  );

  if (recipientResults.length === 0) {
    throw new Error("No recipient publish attempts were created for the wrapped rumor");
  }

  if (recipientSuccesses.length === 0) {
    throw new Error(
      `Recipient publish failed on all relays: ${recipientFailures
        .map(
          (entry) =>
            `${entry.relay}: ${(entry.result as PromiseRejectedResult).reason}`,
        )
        .join(", ")}`,
    );
  }

  const selfResults = results.filter((entry) => entry.kind === "self");
  const selfFailures = selfResults.filter((entry) => entry.result.status === "rejected");

  if (recipientFailures.length > 0 || selfFailures.length > 0) {
    throw new Error(
      `Publish partial success: recipient ${recipientSuccesses.length}/${recipientResults.length} ok, self ${selfResults.length - selfFailures.length}/${selfResults.length} ok`,
    );
  }
}
