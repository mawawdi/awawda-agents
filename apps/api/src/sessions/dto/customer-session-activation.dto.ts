import { IsNotEmpty, IsString } from 'class-validator';
import type { CustomerSessionActivateRequest } from '@awawda/shared-types';

export class CustomerSessionActivationDto implements CustomerSessionActivateRequest {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
