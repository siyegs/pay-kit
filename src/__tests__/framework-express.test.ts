/**
 * Real-framework tests: mount the Express adapter on an actual Express server
 * (network loopback, not a fake request object) and verify middleware behavior,
 * status codes, and that other routes keep normal body parsing.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import http from "node:http";
import express from "express";
import { createPayClient } from "../client";
import { webhookMiddleware } from "../adapters/express";

const SECRET = "sk_test_framework";
const PAYLOAD = {
  event: "charge.success",
  data: { reference: "fw_exp_1", status: "success", amount: 500000, currency: "NGN" },
};
const RAW = JSON.stringify(PAYLOAD);

function sign(raw: string, key: string): string {
  return createHmac("sha512", key).update(raw).digest("hex");
}

let server: http.Server;
let baseUrl = "";
const seen: string[] = [];

beforeAll(async () => {
  const pay = createPayClient({ provider: "paystack", secretKey: SECRET });
  const app = express();

  app.post("/webhooks/pay", webhookMiddleware(pay, { onEvent: (e) => void seen.push(e.reference) }));

  // A normal JSON route - must keep Express's default body parsing.
  app.post("/api/echo", express.json(), (req, res) => {
    res.json({ got: req.body });
  });

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe("express adapter: real server", () => {
  it("returns 200 and dispatches the event on a valid webhook", async () => {
    const res = await fetch(`${baseUrl}/webhooks/pay`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-paystack-signature": sign(RAW, SECRET),
      },
      body: RAW,
    });
    expect(res.status).toBe(200);
    expect(seen).toContain("fw_exp_1");
  });

  it("returns 401 on a tampered signature", async () => {
    const res = await fetch(`${baseUrl}/webhooks/pay`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-paystack-signature": sign(RAW, "wrong-key"),
      },
      body: RAW,
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 on a malformed body (signature valid, JSON invalid)", async () => {
    const malformed = "{not-json";
    const res = await fetch(`${baseUrl}/webhooks/pay`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-paystack-signature": sign(malformed, SECRET),
      },
      body: malformed,
    });
    expect(res.status).toBe(400);
  });

  it("returns 500 when the handler throws (provider will retry)", async () => {
    const pay = createPayClient({ provider: "paystack", secretKey: SECRET });
    const app2 = express();
    app2.post(
      "/webhooks/pay",
      webhookMiddleware(pay, {
        onEvent: () => {
          throw new Error("fulfilment exploded");
        },
      }),
    );
    const srv2 = http.createServer(app2);
    await new Promise<void>((resolve) => srv2.listen(0, "127.0.0.1", resolve));
    const port = (srv2.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/webhooks/pay`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-paystack-signature": sign(RAW, SECRET),
        },
        body: RAW,
      });
      expect(res.status).toBe(500);
    } finally {
      await new Promise<void>((resolve) => srv2.close(() => resolve()));
    }
  });

  it("does not break other routes: JSON body parsing still works", async () => {
    const res = await fetch(`${baseUrl}/api/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hello: "world", n: 42 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ got: { hello: "world", n: 42 } });
  });
});
