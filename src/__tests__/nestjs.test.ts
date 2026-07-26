import { describe, expect, it } from "bun:test";
import {
  InjectPayClient,
  PAY_KIT_CLIENT,
  PayKitModule,
} from "../adapters/nestjs";
import type { FactoryProvider, ValueProvider } from "@nestjs/common";

describe("nestjs: forRoot", () => {
  it("registers a ready PayClient under the token and exports it", () => {
    const mod = PayKitModule.forRoot({ provider: "mock", isGlobal: true });

    expect(mod.module).toBe(PayKitModule);
    expect(mod.global).toBe(true);
    expect(mod.exports).toEqual([PAY_KIT_CLIENT]);

    const provider = mod.providers?.[0] as ValueProvider;
    expect(provider.provide).toBe(PAY_KIT_CLIENT);
    // useValue is a live client, not raw config.
    expect(provider.useValue.provider).toBe("mock");
    expect(typeof provider.useValue.initialize).toBe("function");
  });

  it("defaults to a non-global module", () => {
    const mod = PayKitModule.forRoot({ provider: "mock" });
    expect(mod.global).toBeUndefined();
  });
});

describe("nestjs: forRootAsync", () => {
  it("builds the client from an async factory with injected deps", async () => {
    const mod = PayKitModule.forRootAsync({
      inject: ["CONFIG"],
      useFactory: (cfg: { key: string }) => ({
        provider: "mock" as const,
        secretKey: cfg.key,
      }),
    });

    const provider = mod.providers?.[0] as FactoryProvider;
    expect(provider.provide).toBe(PAY_KIT_CLIENT);
    expect(provider.inject).toEqual(["CONFIG"]);

    const client = await provider.useFactory({ key: "sk_test" });
    expect(client.provider).toBe("mock");
    expect(mod.exports).toEqual([PAY_KIT_CLIENT]);
  });

  it("passes through imports and defaults inject to empty", () => {
    const mod = PayKitModule.forRootAsync({
      useFactory: () => ({ provider: "mock" }),
    });
    const provider = mod.providers?.[0] as FactoryProvider;
    expect(provider.inject).toEqual([]);
    expect(mod.imports).toEqual([]);
  });
});

describe("nestjs: InjectPayClient", () => {
  it("returns a decorator bound to the token", () => {
    expect(typeof InjectPayClient()).toBe("function");
  });
});
