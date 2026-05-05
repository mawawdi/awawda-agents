import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class SupervisorUpdateCustomerProfileDto {
  @ApiPropertyOptional({ example: 'Acme Butcher Shop' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'Sarah' })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(255)
  contactName?: string | null;

  @ApiPropertyOptional({ example: '0521234567' })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @ApiPropertyOptional({ example: 'Tel Aviv' })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ApiPropertyOptional({ example: 'Prefers morning delivery' })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'on_hold'] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['active', 'inactive', 'on_hold'])
  status?: 'active' | 'inactive' | 'on_hold';

  @ApiPropertyOptional({ example: 'Account closed' })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(240)
  reason?: string | null;
}
