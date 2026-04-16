import { IsString, MinLength } from 'class-validator';

export class SupervisorAssignAgentDto {
  @IsString()
  @MinLength(1)
  agentId!: string;
}
