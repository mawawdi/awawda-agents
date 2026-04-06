import { IsString, MinLength } from 'class-validator';

export class AddApprovedItemRequestDto {
  @IsString()
  @MinLength(1)
  hashItemId!: string;
}
