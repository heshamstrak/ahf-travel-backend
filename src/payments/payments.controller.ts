import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type { Response } from "express";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/env";
import { AuthedRequest, OptionalAuth, Public } from "../auth/jwt-auth.guard";
import { InstapaySettingsService } from "./instapay-settings";
import { ProofAccessQuery, SelectCashDto, SubmitInstapayProofDto } from "./payments.dto";
import { PaymentsService } from "./payments.service";

/**
 * Customer-facing payment selection and submission. Admin review lives in
 * admin-payments.controller.ts, guarded by role instead of booking ownership.
 */
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly instapaySettings: InstapaySettingsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get("payments/instapay-instructions")
  @Public()
  getInstapayInstructions() {
    return this.instapaySettings.getInstructions();
  }

  /** Customer-facing: the booking's own payment attempts (e.g. an InstaPay submission's current
   *  status and, if rejected, why). Same ownership rule as the write endpoints below. */
  @Get("bookings/:idOrReference/payments")
  @OptionalAuth()
  listForBooking(@Param("idOrReference") idOrReference: string, @Req() req: AuthedRequest, @Query() query: ProofAccessQuery) {
    return this.payments.listForBooking(idOrReference, { userId: req.user?.id }, query.email);
  }

  @Post("bookings/:idOrReference/payment/cash")
  @OptionalAuth()
  selectCash(@Param("idOrReference") idOrReference: string, @Req() req: AuthedRequest, @Body() dto: SelectCashDto) {
    return this.payments.selectCash(idOrReference, { userId: req.user?.id }, dto);
  }

  @Post("bookings/:idOrReference/payment/instapay")
  @OptionalAuth()
  @HttpCode(201)
  // multer's own limit is a coarse upper bound to stop an oversized upload ever reaching memory;
  // the authoritative, configurable ceiling is enforced in the service (validateProofFile).
  @UseInterceptors(FileInterceptor("proof", { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }))
  async submitInstapayProof(
    @Param("idOrReference") idOrReference: string,
    @Req() req: AuthedRequest,
    @Body() dto: SubmitInstapayProofDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    if (!file) throw new BadRequestException({ code: "VALIDATION_FAILED", title: "Some fields are invalid", errors: [{ field: "proof", message: "is required" }] });
    const result = await this.payments.submitInstapayProof(
      idOrReference,
      { userId: req.user?.id },
      dto,
      { buffer: file.buffer, size: file.size },
      idempotencyKey,
      this.config.paymentProofMaxBytes,
    );
    return result.body;
  }

  @Get("payments/:paymentId/proof")
  @OptionalAuth()
  async getProof(
    @Param("paymentId") paymentId: string,
    @Req() req: AuthedRequest,
    @Query() query: ProofAccessQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const { buffer, mimeType } = await this.payments.getProofFile(paymentId, { userId: req.user?.id, role: req.user?.role }, query.email);
    res.set({ "Content-Type": mimeType, "Content-Disposition": "inline", "Cache-Control": "private, no-store" });
    res.send(buffer);
  }
}
