import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApplicationsService } from './applications.service';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly apps: ApplicationsService) {}

  @Post('draft-shortlisted')
  draft() { return this.apps.draftShortlisted(); }

  @Post('dispatch')
  dispatch(@Body() body: { mode?: string }) { return this.apps.dispatch(body?.mode); }

  @Post('run-queue')
  runQueue() { return this.apps.runQueue(); }

  @Post(':id/decision')
  decide(@Param('id') id: string, @Body() body: { approve: boolean }) {
    return this.apps.decide(id, !!body?.approve);
  }
}
