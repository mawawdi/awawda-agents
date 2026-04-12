import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AgentOrderCancelDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
