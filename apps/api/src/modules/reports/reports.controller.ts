import { Controller, Get } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('daily')
  daily() { return this.reports.daily(); }

  @Get('weekly')
  weekly() { return this.reports.weekly(); }
}
