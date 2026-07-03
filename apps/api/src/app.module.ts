import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { LlmModule } from './modules/llm/llm.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { MatchingModule } from './modules/matching/matching.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { OutreachModule } from './modules/outreach/outreach.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { ConfigController } from './config/config.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    LlmModule,
    JobsModule,
    MatchingModule,
    ApplicationsModule,
    OutreachModule,
    TrackingModule,
    ReportsModule,
    NotificationsModule,
    TasksModule,
  ],
  controllers: [ConfigController],
})
export class AppModule {}
