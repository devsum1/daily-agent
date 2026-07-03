import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { ApplicationsModule } from '../applications/applications.module';
import { TrackingModule } from '../tracking/tracking.module';
import { OutreachModule } from '../outreach/outreach.module';

@Module({
  imports: [ApplicationsModule, TrackingModule, OutreachModule],
  providers: [TasksService],
})
export class TasksModule {}
