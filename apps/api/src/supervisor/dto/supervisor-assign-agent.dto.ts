import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SupervisorAssignAgentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  agentId!: string;
}
