import { IsNotEmpty, IsString } from 'class-validator';
import type { AgentLoginRequest } from '@awawda/shared-types';

export class AgentLoginRequestDto implements AgentLoginRequest {
  @IsString()
  @IsNotEmpty()
  phoneOrEmail!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
