import { IsOptional, IsString } from 'class-validator';

export class AddGalleryImageDto {
  @IsString()
  url!: string;

  @IsOptional()
  @IsString()
  caption?: string;
}
