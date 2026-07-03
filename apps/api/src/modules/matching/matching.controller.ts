import { Controller, Post } from '@nestjs/common';
import { MatchingService } from './matching.service';

@Controller('matching')
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  @Post('score-pending')
  scorePending() {
    return this.matching.scorePending();
  }
}
