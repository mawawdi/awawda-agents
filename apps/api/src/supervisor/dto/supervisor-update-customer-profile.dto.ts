import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class SupervisorUpdateCustomerProfileDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(255)
  contactName?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['active', 'inactive', 'on_hold'])
  status?: 'active' | 'inactive' | 'on_hold';

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(240)
  reason?: string | null;
}
