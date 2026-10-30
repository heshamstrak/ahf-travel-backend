import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req } from "@nestjs/common";
import { AuthedRequest, OptionalAuth } from "../auth/jwt-auth.guard";
import { CreateQuoteDto } from "./quotes.dto";
import { QuotesService } from "./quotes.service";

/**
 * Quotes are created and read by signed-in users and by guests. A guest receives a token once at creation
 * and presents it as X-Quote-Token on every read. Other callers get 404, not 403, so ids cannot be probed.
 */
@Controller("quotes")
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Post()
  @OptionalAuth()
  @HttpCode(201)
  async create(@Body() dto: CreateQuoteDto, @Req() req: AuthedRequest) {
    const created = await this.quotes.create(dto, { userId: req.user?.id });
    return created.guestToken ? { ...created.quote, guestToken: created.guestToken } : created.quote;
  }

  @Get(":id")
  @OptionalAuth()
  get(@Param("id") id: string, @Req() req: AuthedRequest, @Headers("x-quote-token") token?: string) {
    return this.quotes.get(id, { userId: req.user?.id }, token);
  }
}
