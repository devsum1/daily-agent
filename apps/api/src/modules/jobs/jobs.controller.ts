import { Body, Controller, Post } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post('ingest')
  ingest(@Body() body: { cards: any[] }) {
    return this.jobs.ingest(body.cards ?? []);
  }
}
