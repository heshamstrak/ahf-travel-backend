import { IsDefined, IsIn } from "class-validator";
import { ALLOWED_SETTING_KEYS, AllowedSettingKey } from "./allowed-settings";

export class UpdateSettingParam {
  @IsIn(ALLOWED_SETTING_KEYS)
  key!: AllowedSettingKey;
}

/** `value`'s shape depends entirely on which key this is for, so it is validated per-key in the
 *  service (validateSettingValue), not here. @IsDefined (rather than a shape-specific validator)
 *  just registers this property so the global ValidationPipe's whitelist does not strip it. */
export class UpdateSettingBodyDto {
  @IsDefined()
  value!: unknown;
}
