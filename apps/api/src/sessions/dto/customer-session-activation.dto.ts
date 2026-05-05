import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import type { CustomerSessionActivateRequest } from '@awawda/shared-types';

export class CustomerSessionActivationDto implements CustomerSessionActivateRequest {
  @ApiProperty({ description: 'Magic link activation token' })
  @IsString()
  @IsNotEmpty()
  token!: string;
}
