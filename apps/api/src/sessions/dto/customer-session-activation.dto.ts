import { IsNotEmpty, IsString } from 'class-validator';
import type { CustomerSessionActivateRequest } from '@meatland/shared-types';

export class CustomerSessionActivationDto implements CustomerSessionActivateRequest {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
