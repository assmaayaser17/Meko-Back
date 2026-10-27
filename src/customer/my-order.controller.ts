import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, IsUUID, Length } from 'class-validator';
import { PaymentsService, StartKind } from '../payments/payments.service';
import { CurrentOrderId, CustomerOrderGuard } from './customer-auth';
import { EDIT_CATEGORIES, EditCategory, MyOrderService } from './my-order.service';

class StartPaymentDto {
  @IsIn(['DEPOSIT', 'FULL', 'REMAINING']) kind: StartKind;
}

class ApproveDto {
  @IsUUID() versionId: string;
}

class EditRequestDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @IsIn(EDIT_CATEGORIES as unknown as string[], { each: true })
  categories: EditCategory[];
  @IsString() @Length(5, 1000) text: string;
}

/** Everything a customer does on HER order. Requires the token from POST /orders or /orders/access. */
@Controller('my-order')
@UseGuards(CustomerOrderGuard)
export class MyOrderController {
  constructor(
    private readonly myOrder: MyOrderService,
    private readonly payments: PaymentsService,
  ) {}

  /** Summary, pricing, tracking timeline, next action. */
  @Get()
  get(@CurrentOrderId() orderId: string) {
    return this.myOrder.get(orderId);
  }

  /** Start paying: DEPOSIT or FULL (after creating the order), REMAINING (after approval). */
  @Post('payments')
  start(@CurrentOrderId() orderId: string, @Body() dto: StartPaymentDto) {
    return this.payments.start(orderId, dto.kind);
  }

  /** The design ready for review. */
  @Get('design')
  design(@CurrentOrderId() orderId: string) {
    return this.myOrder.getDesign(orderId);
  }

  @Post('design/approve')
  @HttpCode(200)
  approve(@CurrentOrderId() orderId: string, @Body() dto: ApproveDto) {
    return this.myOrder.approve(orderId, dto.versionId);
  }

  @Post('design/edit-requests')
  requestEdit(@CurrentOrderId() orderId: string, @Body() dto: EditRequestDto) {
    return this.myOrder.requestEdit(orderId, dto.categories, dto.text);
  }

  /** "Talk to us on WhatsApp" with the order code pre-filled. */
  @Get('whatsapp')
  whatsapp(@CurrentOrderId() orderId: string) {
    return this.myOrder.whatsappUrl(orderId);
  }
}
