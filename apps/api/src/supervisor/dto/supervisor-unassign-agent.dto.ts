import { IsOptional, IsString, MinLength } from 'class-validator';

export class SupervisorUnassignAgentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  agentId?: string;
}
