import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SupervisorBulkReassignDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  fromAgentId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  toAgentId!: string;

  @ApiPropertyOptional({ description: 'If omitted, all customers from fromAgentId are moved' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customerIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string | null;
}
