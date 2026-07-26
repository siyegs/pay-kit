/**
 * Using pay-kit in a NestJS app (illustrative - needs `@nestjs/common`).
 *
 * `PayKitModule.forRoot` (or `forRootAsync` to read config from `ConfigService`)
 * registers a configured `PayClient` in the DI container; inject it anywhere
 * with `@InjectPayClient()`.
 */
import { Injectable, Module } from "@nestjs/common";
import type { PayClient } from "../src";
import { InjectPayClient, PayKitModule } from "../src/adapters/nestjs";

@Injectable()
export class PaymentsService {
  constructor(@InjectPayClient() private readonly pay: PayClient) {}

  startCheckout(email: string, amountKobo: number) {
    return this.pay.initialize({ amount: amountKobo, email });
  }
}

@Module({
  imports: [
    // Static config:
    PayKitModule.forRoot({
      provider: "paystack",
      secretKey: process.env.PAYSTACK_SECRET_KEY!,
      isGlobal: true,
    }),

    // Or async, e.g. from ConfigService:
    // PayKitModule.forRootAsync({
    //   inject: [ConfigService],
    //   useFactory: (config: ConfigService) => ({
    //     provider: "paystack",
    //     secretKey: config.getOrThrow("PAYSTACK_SECRET_KEY"),
    //   }),
    // }),
  ],
  providers: [PaymentsService],
})
export class AppModule {}
