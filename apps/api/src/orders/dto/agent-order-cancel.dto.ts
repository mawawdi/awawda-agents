import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AgentOrderCancelDto {
  @ApiPropertyOptional({ example: 'Customer changed their mind' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
