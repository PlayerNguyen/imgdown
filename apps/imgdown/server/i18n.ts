import { ImageValidationError } from "@imgdown/media";
import type { Locale } from "@imgdown/shared";
import { translate } from "../src/lib/messages";

/**
 * Maps an image pipeline error to a localized, user-facing message.
 * @param error - Error thrown by the image pipeline.
 * @param locale - Target locale.
 * @returns A localized error message.
 */
export function imageErrorMessage(error: unknown, locale: Locale): string {
  if (error instanceof ImageValidationError) {
    switch (error.code) {
      case "max-pixels":
        return translate(locale, "image.tooManyPixels", { max: error.maxPixelsMP ?? "" });
      case "unsupported-format":
        return translate(locale, "image.formatUnsupported");
      default:
        return translate(locale, "image.invalid");
    }
  }

  const code = (error as { code?: string }).code;
  if (code === "ERR_IMAGE_FORMAT_UNSUPPORTED") return translate(locale, "image.formatUnsupported");
  if (code === "ERR_IMAGE_DECODE_FAILED") return translate(locale, "image.decodeFailed");
  return translate(locale, "image.generic");
}
