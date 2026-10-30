import { IsIn } from "class-validator";

export const CONTENT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type ContentStatusCode = (typeof CONTENT_STATUSES)[number];

/** Shared publish/unpublish body for every catalogue admin module (destinations, hotels, rooms,
 *  rate plans, tours, car models, transfer vehicle classes, packages all use ContentStatus). */
export class SetStatusDto {
  @IsIn(CONTENT_STATUSES)
  status!: ContentStatusCode;
}
