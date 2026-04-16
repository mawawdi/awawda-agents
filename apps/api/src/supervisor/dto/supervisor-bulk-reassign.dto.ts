import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SupervisorBulkReassignDto {
  @IsString()
  @MinLength(1)
  fromAgentId!: string;

  @IsString()
  @MinLength(1)
  toAgentId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customerIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string | null;
}
