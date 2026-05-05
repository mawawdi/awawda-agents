import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SupervisorCreateAgentDto {
  @ApiProperty({ example: 'David Cohen' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '0501234567' })
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  phone!: string;

  @ApiPropertyOptional({ example: 'david@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ enum: ['field_agent', 'supervisor'], default: 'field_agent' })
  @IsOptional()
  @IsIn(['field_agent', 'supervisor'])
  role?: 'field_agent' | 'supervisor';
}
