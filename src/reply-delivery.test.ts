import { describe, expect, it, vi } from "vitest";
import {
  createDeliveryFailureNotifier,
  createInboundReplyFn,
  createNostrDeliverHandler,
  DELIVERY_FAILURE_NOTICE,
  formatDeliveryFailureNotice,
} from "./reply-delivery.js";

describe("createInboundReplyFn", () => {
  it("rethrows when sendDm rejects and still calls onError", async () => {
    const sendError = new Error("relay down");
    const sendDm = vi.fn().mockRejectedValue(sendError);
    const onError = vi.fn();

    const replyFn = createInboundReplyFn({
      sendDm,
      onError,
      errorContext: "reply to abc123",
    });

    await expect(replyFn("hello")).rejects.toThrow("relay down");
    expect(sendDm).toHaveBeenCalledWith("hello");
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(sendError, "reply to abc123");
  });

  it("resolves when sendDm succeeds", async () => {
    const sendDm = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();

    const replyFn = createInboundReplyFn({
      sendDm,
      onError,
      errorContext: "reply to abc123",
    });

    await replyFn("hello");
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("createNostrDeliverHandler", () => {
  const senderPubkey = "7b484f7b96960deffc0a42961cf1de90a43268d67accce9ec50a04e6b0092593";
  const accountId = "default";

  function makeLog() {
    return {
      info: vi.fn(),
      error: vi.fn(),
    };
  }

  it("does not log success when replyFn rejects", async () => {
    const log = makeLog();
    const replyFn = vi.fn().mockRejectedValue(new Error("send failed"));
    const onDeliveryError = vi.fn();

    const deliver = createNostrDeliverHandler({
      replyFn,
      log,
      accountId,
      senderPubkey,
      onDeliveryError,
    });

    await expect(
      deliver({ text: "hello" }, { kind: "final" }),
    ).rejects.toThrow("send failed");

    expect(log.info).not.toHaveBeenCalled();
    expect(onDeliveryError).toHaveBeenCalledOnce();
    expect(onDeliveryError.mock.calls[0][1]).toEqual({ kind: "final" });
  });

  it("logs success with kind when replyFn resolves", async () => {
    const log = makeLog();
    const replyFn = vi.fn().mockResolvedValue(undefined);

    const deliver = createNostrDeliverHandler({
      replyFn,
      log,
      accountId,
      senderPubkey,
    });

    await deliver({ text: "hello" }, { kind: "block" });

    expect(replyFn).toHaveBeenCalledWith("hello");
    expect(log.info).toHaveBeenCalledOnce();
    expect(String(log.info.mock.calls[0][0])).toMatch(/block/i);
    expect(String(log.info.mock.calls[0][0])).toContain(senderPubkey.slice(0, 8));
  });

  it("skips replyFn for empty text", async () => {
    const log = makeLog();
    const replyFn = vi.fn();

    const deliver = createNostrDeliverHandler({
      replyFn,
      log,
      accountId,
      senderPubkey,
    });

    await deliver({ text: "   " }, { kind: "final" });

    expect(replyFn).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
  });
});

describe("createDeliveryFailureNotifier", () => {
  it("sends the fixed notice once on first failure", async () => {
    const replyFn = vi.fn().mockResolvedValue(undefined);
    const notify = createDeliveryFailureNotifier(replyFn);

    await notify(new Error("first"));
    await notify(new Error("second"));

    expect(replyFn).toHaveBeenCalledOnce();
    expect(replyFn).toHaveBeenCalledWith(formatDeliveryFailureNotice());
    expect(formatDeliveryFailureNotice()).toBe(DELIVERY_FAILURE_NOTICE);
  });

  it("does not throw when the notice send fails and stays latched", async () => {
    const replyFn = vi.fn().mockRejectedValue(new Error("relay down"));
    const notify = createDeliveryFailureNotifier(replyFn);

    await expect(notify(new Error("first"))).resolves.toBeUndefined();
    await notify(new Error("second"));

    expect(replyFn).toHaveBeenCalledOnce();
  });
});
