import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { SequelizeModule } from '@nestjs/sequelize';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { sequelizeConfig } from './database/database.config';
import { PrismaModule } from './auth/prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FacilityModule } from './facility/facility.module';
import { BranchModule } from './branch/branch.module';
import { ResidentsModule } from './residents/residents.module';
import { StaffModule } from './staff/staff.module';
import { RulesModule } from './rules/rules.module';
import { TaskModule } from './task/task.module';
import { VitalsModule } from './vitals/vitals.module';
import { NotesModule } from './notes/notes.module';
import { AlertsModule } from './alerts/alerts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SequelizeModule.forRoot(sequelizeConfig),
    PrismaModule,
    AuthModule,
    UsersModule,
    FacilityModule,
    BranchModule,
    ResidentsModule,
    StaffModule,
    RulesModule,
    TaskModule,
    VitalsModule,
    NotesModule,
    AlertsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
  ],
})
export class AppModule {}