import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SupervisorForceLogoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string | null;
}
