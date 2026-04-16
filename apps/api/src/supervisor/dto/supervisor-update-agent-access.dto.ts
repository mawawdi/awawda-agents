import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SupervisorUpdateAgentAccessDto {
  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string | null;
}
