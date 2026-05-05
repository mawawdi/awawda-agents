import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class CustomerOrderSubmitLineDto {
  @ApiProperty({ example: '100001' })
  @IsString()
  @MinLength(1)
  itemId!: string;

  @ApiProperty({ example: 2.5 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @ApiProperty({ enum: ['kg'] })
  @IsIn(['kg'])
  unit!: 'kg';

  @ApiProperty({ example: 45.5 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  clientUnitPrice!: number;
}

export class CustomerOrderSubmitDto {
  @ApiProperty({ type: [CustomerOrderSubmitLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CustomerOrderSubmitLineDto)
  lines!: CustomerOrderSubmitLineDto[];

  @ApiPropertyOptional({ example: 'Please deliver before noon' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ example: '2026-05-20', description: 'Requested delivery date in YYYY-MM-DD format' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'requestedDeliveryDate must be a date in YYYY-MM-DD format' })
  requestedDeliveryDate?: string;
}
