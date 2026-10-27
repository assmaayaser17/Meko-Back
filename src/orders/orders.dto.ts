import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class QuoteDto {
  @IsUUID() pieceTypeId: string;
  @IsUUID() styleId: string;
  @IsOptional() @IsUUID() colorOptionId?: string;
  @IsOptional() @IsUUID() lengthOptionId?: string;
  @IsString() @Length(2, 60) governorate: string;
}

class CustomerDto {
  @IsString() @Length(2, 80) name: string;
  @IsString() @Length(8, 20) phone: string;
  @IsOptional() @IsEmail() email?: string;
}

class ShippingDto {
  @IsString() @Length(2, 60) governorate: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsString() @Length(5, 300) address: string;
}

class PieceDto {
  @IsUUID() pieceTypeId: string;
  @IsUUID() styleId: string;
  @IsOptional() @IsUUID() colorOptionId?: string;
  @IsOptional() @IsUUID() lengthOptionId?: string;
  @IsOptional() @IsString() @Length(1, 30) engravingName?: string;
}

class GiftDto {
  @IsIn(['MOTHER', 'PARTNER', 'SISTER', 'FRIEND', 'OTHER'])
  relationship: 'MOTHER' | 'PARTNER' | 'SISTER' | 'FRIEND' | 'OTHER';
  @IsString() @Length(1, 80) recipientName: string;
  @IsOptional() @IsString() @MaxLength(300) message?: string;
}

class GuidingAnswerDto {
  @IsUUID() questionId: string;
  @IsString() @Length(1, 500) answer: string;
}

export class CreateOrderDto {
  @IsIn(['FOR_ME', 'GIFT']) type: 'FOR_ME' | 'GIFT';

  @ValidateNested() @Type(() => CustomerDto) customer: CustomerDto;
  @ValidateNested() @Type(() => ShippingDto) shipping: ShippingDto;
  @ValidateNested() @Type(() => PieceDto) piece: PieceDto;

  /** The heart of the brand: no short limit, only an abuse cap. */
  @IsOptional() @IsString() @MaxLength(5000) story?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsUUID('all', { each: true }) symbolIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) chipIds?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => GuidingAnswerDto)
  guidingAnswers?: GuidingAnswerDto[];

  @IsOptional() @ValidateNested() @Type(() => GiftDto) gift?: GiftDto;

  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsUUID('all', { each: true }) uploadIds?: string[];

  /** The deposit + edits policy checkbox. Must be explicitly true. */
  @Equals(true, { message: 'لازم توافقي على سياسة العربون والتعديلات' })
  acceptPolicy: boolean;

  @IsOptional() @IsObject() utm?: Record<string, string>;
  @IsOptional() @IsString() @MaxLength(100) sessionId?: string;
}

export class AccessOrderDto {
  @IsString() @Length(4, 20) code: string;
  @IsString() @Length(8, 20) phone: string;
}
