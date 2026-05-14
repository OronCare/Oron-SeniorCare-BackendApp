import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AlertsService } from './alerts.service';

const DAY_MS = 86_400_000;

@Injectable()
export class ContractExpiryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContractExpiryScheduler.name);
  private interval: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly alertsService: AlertsService) {}

  onModuleInit(): void {
    void this.run().catch((err) =>
      this.logger.error(err instanceof Error ? err.message : String(err)),
    );
    this.interval = setInterval(() => {
      void this.run().catch((err) =>
        this.logger.error(err instanceof Error ? err.message : String(err)),
      );
    }, DAY_MS);
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private async run(): Promise<void> {
    await this.alertsService.syncContractExpiryOwnerAlerts();
  }
}
