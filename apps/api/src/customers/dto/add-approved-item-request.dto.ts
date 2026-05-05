import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AddApprovedItemRequestDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(1)
  hashItemId!: string;
}
