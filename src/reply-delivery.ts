export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

export type InboundReplyFn = (responseText: string) => Promise<void>;

export function createInboundReplyFn(params: {
  sendDm: (text: string) => Promise<void>;
  onError?: (error: Error, context: string) => void;
  errorContext: string;
}): InboundReplyFn {
  return async (responseText: string): Promise<void> => {
    try {
      await params.sendDm(responseText);
    } catch (err) {
      const error = toError(err);
      params.onError?.(error, params.errorContext);
      throw error;
    }
  };
}

export type ReplyLifecycleKind = "final" | "block" | "tool";

export type DeliverPayload = { text?: string; mediaPath?: string };

export type DeliverLog = {
  info?: (message: string) => void;
  error?: (message: string) => void;
};

export const DELIVERY_FAILURE_NOTICE =
  "Could not deliver my last reply. Please try again or check relay connectivity.";

export function formatDeliveryFailureNotice(): string {
  return DELIVERY_FAILURE_NOTICE;
}

/** Best-effort user notice when outbound delivery fails; at most once per inbound turn. */
export function createDeliveryFailureNotifier(
  replyFn: InboundReplyFn,
): (err: unknown) => Promise<void> {
  let latched = false;
  let inFlight = false;

  return async (_err: unknown): Promise<void> => {
    if (latched || inFlight) return;
    inFlight = true;
    try {
      await replyFn(formatDeliveryFailureNotice());
      latched = true;
    } catch {
      // Notice uses the same transport; if it fails, avoid loops and retries.
      latched = true;
    } finally {
      inFlight = false;
    }
  };
}

export function createNostrDeliverHandler(params: {
  replyFn: InboundReplyFn;
  log?: DeliverLog;
  accountId: string;
  senderPubkey: string;
  onDeliveryError?: (error: Error, info: { kind: ReplyLifecycleKind }) => void;
}): (
  payload: DeliverPayload,
  info: { kind: ReplyLifecycleKind },
) => Promise<void> {
  return async (payload, info) => {
    const responseText = payload.text ?? "";
    if (!responseText.trim()) return;

    try {
      await params.replyFn(responseText);
      params.log?.info?.(
        `[${params.accountId}] NIP-17 reply sent (${info.kind}) to ${params.senderPubkey.slice(0, 8)}…`,
      );
    } catch (err) {
      const error = toError(err);
      params.log?.error?.(
        `[${params.accountId}] NIP-17 reply failed (${info.kind}) to ${params.senderPubkey.slice(0, 8)}…: ${error.message}`,
      );
      params.onDeliveryError?.(error, info);
      throw error;
    }
  };
}
