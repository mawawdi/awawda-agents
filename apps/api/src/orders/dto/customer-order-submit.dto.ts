import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class CustomerOrderSubmitLineDto {
  @IsString()
  @MinLength(1)
  itemId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @IsIn(['kg', 'unit'])
  unit!: 'kg' | 'unit';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  clientUnitPrice!: number;
}

export class CustomerOrderSubmitDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CustomerOrderSubmitLineDto)
  lines!: CustomerOrderSubmitLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
