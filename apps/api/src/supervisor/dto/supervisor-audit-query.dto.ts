import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SupervisorAuditQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  actorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  eventType?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
