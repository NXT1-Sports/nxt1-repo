/**
 * @fileoverview Usage & Payment Methods Data Transfer Objects (DTOs)
 * @module @nxt1/backend/dtos/usage
 *
 * DTOs for payment methods, billing info, and coupon management
 */

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  IsEmail,
  Matches,
  Length,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================
// PAYMENT METHOD DTOs
// ============================================

export enum PaymentMethodType {
  CARD = 'card',
  BANK_ACCOUNT = 'bank_account',
  PAYPAL = 'paypal',
}

export class CardDetailsDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{13,19}$/, { message: 'Invalid card number format' })
  number!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  expMonth!: number;

  @IsInt()
  @Min(2024)
  @Max(2099)
  expYear!: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{3,4}$/, { message: 'Invalid CVC format' })
  cvc!: string;

  @IsString()
  @IsOptional()
  @Length(1, 100)
  cardholderName?: string;
}

export class BankAccountDetailsDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{9,17}$/, { message: 'Invalid account number format' })
  accountNumber!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{9}$/, { message: 'Invalid routing number format (must be 9 digits)' })
  routingNumber!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  accountHolderName!: string;

  @IsEnum(['checking', 'savings'])
  @IsNotEmpty()
  accountType!: 'checking' | 'savings';
}

export class AddPaymentMethodDto {
  @IsEnum(PaymentMethodType)
  @IsNotEmpty()
  type!: PaymentMethodType;

  @ValidateNested()
  @Type(() => CardDetailsDto)
  @IsOptional()
  card?: CardDetailsDto;

  @ValidateNested()
  @Type(() => BankAccountDetailsDto)
  @IsOptional()
  bankAccount?: BankAccountDetailsDto;

  @IsString()
  @IsOptional()
  paypalAccountId?: string;

  @IsBoolean()
  @IsOptional()
  setAsDefault?: boolean;
}

export class UpdatePaymentMethodDto {
  @IsString()
  @IsNotEmpty()
  paymentMethodId!: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(12)
  expMonth?: number;

  @IsInt()
  @IsOptional()
  @Min(2024)
  @Max(2099)
  expYear?: number;

  @IsBoolean()
  @IsOptional()
  setAsDefault?: boolean;
}

export class RemovePaymentMethodDto {
  @IsString()
  @IsNotEmpty()
  paymentMethodId!: string;

  @IsBoolean()
  @IsOptional()
  revokeAuthorization?: boolean;
}

export class SetDefaultPaymentMethodDto {
  @IsString()
  @IsNotEmpty()
  paymentMethodId!: string;
}

// ============================================
// BILLING INFO DTOs
// ============================================

export class BillingAddressDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  line1!: string;

  @IsString()
  @IsOptional()
  @Length(0, 200)
  line2?: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  city!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{2}$/, { message: 'State must be 2-letter code (e.g., CA, NY)' })
  state!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{5}(-\d{4})?$/, { message: 'Invalid ZIP code format' })
  postalCode!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{2}$/, { message: 'Country must be 2-letter ISO code (e.g., US, CA)' })
  country!: string;
}

export class UpdateBillingInfoDto {
  @IsEmail({}, { message: 'Invalid billing email format' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Phone must be in E.164 format' })
  phone?: string;

  @IsString()
  @IsOptional()
  @Length(1, 100)
  companyName?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{2}-\d{7}$/, { message: 'Invalid Tax ID format (e.g., 12-3456789)' })
  taxId?: string;

  @ValidateNested()
  @Type(() => BillingAddressDto)
  @IsOptional()
  address?: BillingAddressDto;
}

// ============================================
// COUPON DTOs
// ============================================

export class RedeemCouponDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9]{6,20}$/, { message: 'Invalid coupon code format' })
  @Length(6, 20)
  code!: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  teamId?: string;
}

export class ApplyCouponDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9]{6,20}$/, { message: 'Invalid coupon code format' })
  @Length(6, 20)
  code!: string;
}

// ============================================
// TAX DTOs
// ============================================

export class CalculateTaxDto {
  @IsInt()
  @Min(1)
  @Max(100000000) // $1M max
  amountCents!: number;

  @ValidateNested()
  @Type(() => BillingAddressDto)
  @IsNotEmpty()
  address!: BillingAddressDto;

  @IsString()
  @IsOptional()
  taxExemptId?: string;
}

// ============================================
// SIMPLE PAYMENT METHOD DTOs (Actual API Usage)
// ============================================

export class AddPaymentMethodTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class PaymentMethodIdDto {
  @IsString()
  @IsNotEmpty()
  methodId!: string;
}

export class SimpleBillingInfoDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  name!: string;

  @IsString()
  @IsOptional()
  @Length(0, 200)
  addressLine1?: string;

  @IsString()
  @IsOptional()
  @Length(0, 200)
  addressLine2?: string;

  @IsString()
  @IsOptional()
  @Length(0, 100)
  country?: string;
}

// ============================================
// BUY CREDITS DTO
// ============================================

export class BuyCreditsDto {
  @IsInt()
  @Min(500)
  @Max(50000)
  amountCents!: number;
}
