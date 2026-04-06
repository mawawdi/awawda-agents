import { IsNotEmpty, IsString } from 'class-validator';
import type { AgentLoginRequest } from '@meatland/shared-types';

export class AgentLoginRequestDto implements AgentLoginRequest {
  @IsString()
  @IsNotEmpty()
  phoneOrEmail!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
