import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import type { AgentLoginRequest } from '@awawda/shared-types';

export class AgentLoginRequestDto implements AgentLoginRequest {
  @ApiProperty({ example: '050-1234567' })
  @IsString()
  @IsNotEmpty()
  phoneOrEmail!: string;

  @ApiProperty({ example: 'Password123' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
