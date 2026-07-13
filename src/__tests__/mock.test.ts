import { describe, expect, it } from "bun:test";
import { createPayClient } from "../client";
import { PayKitError } from "../errors";

describe("mock: config", () => {
  it("works with no secretKey and no fetch", () => {
    const pay = createPayClient({ provider: "mock" });
    expect(pay.provider).toBe("mock");
  });
});

describe("mock: charge lifecycle", () => {
  it("remembers an initialized charge and echoes it on verify", async () => {
    const pay = createPayClient({ provider: "mock" });

    const init = await pay.initialize({ amount: 500000, email: "a@b.com", reference: "ref_1" });
    expect(init.reference).toBe("ref_1");
    expect(init.authorizationUrl).toContain("ref_1");

    const verified = await pay.verify("ref_1");
    expect(verified.status).toBe("success");
    expect(verified.amount).toBe(500000);
    expect(verified.customer?.email).toBe("a@b.com");
  });

  it("treats an unknown reference as abandoned", async () => {
    const pay = createPayClient({ provider: "mock" });
    const verified = await pay.verify("does-not-exist");
    expect(verified.status).toBe("abandoned");
    expect(verified.amount).toBe(0);
  });

  it("keeps each client's store isolated", async () => {
    const a = createPayClient({ provider: "mock" });
    const b = createPayClient({ provider: "mock" });
    await a.initialize({ amount: 100, email: "a@b.com", reference: "shared" });

    expect((await a.verify("shared")).status).toBe("success");
    expect((await b.verify("shared")).status).toBe("abandoned");
  });

  it("generates a reference when none is given", async () => {
    const pay = createPayClient({ provider: "mock" });
    const init = await pay.initialize({ amount: 100, email: "a@b.com" });
    expect(init.reference).toBeTruthy();
    expect((await pay.verify(init.reference)).status).toBe("success");
  });
});

describe("mock: refund & transfer", () => {
  it("refunds the full charged amount by default", async () => {
    const pay = createPayClient({ provider: "mock" });
    await pay.initialize({ amount: 500000, email: "a@b.com", reference: "ref_1" });

    const full = await pay.refund("ref_1");
    expect(full.status).toBe("processed");
    expect(full.amount).toBe(500000);

    const partial = await pay.refund("ref_1", { amount: 20000 });
    expect(partial.amount).toBe(20000);
  });

  it("sends a payout", async () => {
    const pay = createPayClient({ provider: "mock" });
    const res = await pay.transfer({
      amount: 10000,
      recipient: { accountNumber: "0001234567", bankCode: "001" },
    });
    expect(res.status).toBe("success");
    expect(res.amount).toBe(10000);
    expect(res.transferId).toContain("mock_trf_");
  });

  it("remembers a payout so verifyTransfer echoes it", async () => {
    const pay = createPayClient({ provider: "mock" });
    const sent = await pay.transfer({
      amount: 10000,
      recipient: { accountNumber: "0001234567", bankCode: "001" },
    });

    const checked = await pay.verifyTransfer(sent.transferId!);
    expect(checked.status).toBe("success");
    expect(checked.amount).toBe(10000);
  });

  it("verifies an unknown transfer as pending", async () => {
    const pay = createPayClient({ provider: "mock" });
    expect((await pay.verifyTransfer("nope")).status).toBe("pending");
  });
});

describe("mock: banks & resolution", () => {
  it("lists mock banks and resolves an account", async () => {
    const pay = createPayClient({ provider: "mock" });

    const banks = await pay.listBanks();
    expect(banks.length).toBeGreaterThan(0);
    expect(banks[0]).toHaveProperty("code");

    const account = await pay.resolveAccount({ accountNumber: "0001234567", bankCode: "001" });
    expect(account.accountName).toBe("MOCK ACCOUNT HOLDER");
    expect(account.accountNumber).toBe("0001234567");
  });
});

describe("mock: webhooks", () => {
  const raw = JSON.stringify({
    event: "charge.success",
    data: { reference: "ref_1", status: "success", amount: 500000, currency: "NGN" },
  });

  it("normalizes a signed event", () => {
    const pay = createPayClient({ provider: "mock" });
    const event = pay.webhooks.construct(raw, "any-non-empty-signature");
    expect(event.type).toBe("charge.success");
    expect(event.reference).toBe("ref_1");
    expect(event.amount).toBe(500000);
  });

  it("rejects a missing signature", () => {
    const pay = createPayClient({ provider: "mock" });
    expect(() => pay.webhooks.construct(raw, "")).toThrow(PayKitError);
  });
});
