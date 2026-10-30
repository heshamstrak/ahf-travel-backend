import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import { AuthedRequest, AuthenticatedUser, OptionalAuth } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/authz";
import { BookingAccessQuery, CancelBookingDto, CreateBookingDto, ListMyBookingsQuery } from "./bookings.dto";
import { BookingsService } from "./bookings.service";

/**
 * Bookings are created and read by signed-in users and by guests alike. A signed-in owner is
 * recognised by their session; a guest proves access with the booking's own email address. Anyone
 * else, including a signed-in user who is not the owner, gets 404 — never a hint that the booking
 * exists under a different account.
 */
@Controller("bookings")
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @OptionalAuth()
  @HttpCode(201)
  async create(@Body() dto: CreateBookingDto, @Req() req: AuthedRequest, @Headers("idempotency-key") idempotencyKey?: string) {
    const result = await this.bookings.create(dto, { userId: req.user?.id }, idempotencyKey);
    return result.body;
  }

  /** Mandatory auth (no @OptionalAuth): a guest has no persistent identity to list bookings by.
   *  Registered before the ":idOrReference" route below so "mine" is never parsed as a reference. */
  @Get("mine")
  listMine(@CurrentUser() user: AuthenticatedUser, @Query() query: ListMyBookingsQuery) {
    return this.bookings.listMine(user.id, query);
  }

  @Get(":idOrReference")
  @OptionalAuth()
  get(@Param("idOrReference") idOrReference: string, @Req() req: AuthedRequest, @Query() query: BookingAccessQuery) {
    return this.bookings.get(idOrReference, { userId: req.user?.id }, query.email);
  }

  @Post(":idOrReference/cancel")
  @OptionalAuth()
  cancel(@Param("idOrReference") idOrReference: string, @Req() req: AuthedRequest, @Body() dto: CancelBookingDto) {
    return this.bookings.cancel(idOrReference, { userId: req.user?.id }, dto);
  }
}
