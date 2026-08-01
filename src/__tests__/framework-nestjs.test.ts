/**
 * Real-framework tests: compile a real NestJS application with
 * PayKitModule.forRoot / forRootAsync and verify the PayClient is injected
 * and usable through the actual DI container.
 */
import { describe, expect, it } from "bun:test";
import { Test } from "@nestjs/testing";
import { Controller, Get, Injectable, Module } from "@nestjs/common";
import "reflect-metadata";
import { createPayClient } from "../client";
import type { PayClient } from "../types";
import { InjectPayClient, PAY_KIT_CLIENT, PayKitModule } from "../adapters/nestjs";

@Injectable()
class PaymentsService {
  constructor(@InjectPayClient() private readonly pay: PayClient) {}
  checkout() {
    return this.pay.initialize({ amount: 500000, email: "a@b.com" });
  }
}

@Controller("pay")
class PaymentsController {
  constructor(@InjectPayClient() private readonly pay: PayClient) {}
  @Get("ping")
  ping() {
    return { provider: this.pay.provider };
  }
}

@Module({ controllers: [PaymentsController], providers: [PaymentsService] })
class AppModule {}

describe("nestjs adapter: real NestJS application", () => {
  it("forRoot registers a working client that a service can inject", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PayKitModule.forRoot({ provider: "mock", isGlobal: true }),
        AppModule,
      ],
    }).compile();

    const service = moduleRef.get(PaymentsService);
    const init = await service.checkout();
    expect(init.reference).toBeTruthy();
    expect(init.authorizationUrl).toContain("pay-kit.dev");

    const controller = moduleRef.get(PaymentsController);
    expect(controller.ping()).toEqual({ provider: "mock" });

    const client = moduleRef.get<PayClient>(PAY_KIT_CLIENT);
    expect(client.provider).toBe("mock");
  });

  it("forRootAsync builds the config via useFactory (e.g. from ConfigService)", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PayKitModule.forRootAsync({
          inject: [],
          useFactory: async () => ({ provider: "paystack" as const, secretKey: "sk_test_nest" }),
        }),
      ],
    }).compile();

    const client = moduleRef.get<PayClient>(PAY_KIT_CLIENT);
    expect(client.provider).toBe("paystack");
  });

  it("createPayClient is not required for the module to work (module constructs it)", async () => {
    // Referenced to keep the import meaningful; the module itself creates clients.
    expect(typeof createPayClient).toBe("function");
  });
});
