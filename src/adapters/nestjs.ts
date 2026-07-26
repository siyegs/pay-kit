/**
 * NestJS module for pay-kit.
 *
 * `PayKitModule.forRoot(config)` (or `forRootAsync` to read config from
 * `ConfigService`) registers a ready-to-use `PayClient` in the DI container.
 * Inject it with `@InjectPayClient()`.
 *
 * @example
 * // app.module.ts
 * import { PayKitModule } from "@siyegs/pay-kit/nestjs";
 *
 * @Module({
 *   imports: [
 *     PayKitModule.forRoot({
 *       provider: "paystack",
 *       secretKey: process.env.PAYSTACK_SECRET_KEY!,
 *       isGlobal: true,
 *     }),
 *   ],
 * })
 * export class AppModule {}
 *
 * @example
 * // payments.service.ts
 * import { InjectPayClient } from "@siyegs/pay-kit/nestjs";
 * import type { PayClient } from "@siyegs/pay-kit";
 *
 * @Injectable()
 * export class PaymentsService {
 *   constructor(@InjectPayClient() private readonly pay: PayClient) {}
 *   checkout() {
 *     return this.pay.initialize({ amount: 500000, email: "a@b.com" });
 *   }
 * }
 */
import { Inject } from "@nestjs/common";
import type {
  DynamicModule,
  FactoryProvider,
  ModuleMetadata,
  Provider,
} from "@nestjs/common";
import { createPayClient } from "../client";
import type { PayClient, PayClientConfig } from "../types";

/** DI token the pay-kit `PayClient` is registered under. */
export const PAY_KIT_CLIENT = "PAY_KIT_CLIENT";

/** Inject the pay-kit `PayClient` into a NestJS provider or controller. */
export const InjectPayClient = (): ParameterDecorator & PropertyDecorator =>
  Inject(PAY_KIT_CLIENT);

export interface PayKitModuleOptions extends PayClientConfig {
  /**
   * Register the client globally, so any module can `@InjectPayClient()` without
   * importing `PayKitModule` again. Defaults to `false`.
   */
  isGlobal?: boolean;
}

export interface PayKitModuleAsyncOptions extends Pick<ModuleMetadata, "imports"> {
  isGlobal?: boolean;
  /** Providers to inject into `useFactory` (e.g. `[ConfigService]`). */
  inject?: FactoryProvider["inject"];
  /** Build the client config, optionally async (e.g. from `ConfigService`). */
  useFactory: (...args: any[]) => PayClientConfig | Promise<PayClientConfig>;
}

/**
 * NestJS dynamic module that provides a configured `PayClient`. It carries no
 * `@Module()` decorator on purpose - a dynamic module's metadata comes from the
 * object returned by `forRoot`/`forRootAsync`, so pay-kit stays free of any
 * `experimentalDecorators` build requirement.
 */
export class PayKitModule {
  /** Register with a static config. */
  static forRoot(options: PayKitModuleOptions): DynamicModule {
    const { isGlobal, ...config } = options;
    const provider: Provider = {
      provide: PAY_KIT_CLIENT,
      useValue: createPayClient(config),
    };
    return {
      module: PayKitModule,
      global: isGlobal,
      providers: [provider],
      exports: [PAY_KIT_CLIENT],
    };
  }

  /** Register with config built at runtime (e.g. from `ConfigService`). */
  static forRootAsync(options: PayKitModuleAsyncOptions): DynamicModule {
    const provider: FactoryProvider = {
      provide: PAY_KIT_CLIENT,
      useFactory: async (...args: unknown[]): Promise<PayClient> =>
        createPayClient(await options.useFactory(...args)),
      inject: options.inject ?? [],
    };
    return {
      module: PayKitModule,
      global: options.isGlobal,
      imports: options.imports ?? [],
      providers: [provider],
      exports: [PAY_KIT_CLIENT],
    };
  }
}
