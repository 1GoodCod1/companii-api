import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class AddProjectPhotosDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  fileKeys!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  caption?: string;
}

export class UpdatePhotoCaptionDto {
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  caption!: string | null;
}
