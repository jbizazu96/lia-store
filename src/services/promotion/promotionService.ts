/*
|--------------------------------------------------------------------------
| Promotion Service
|--------------------------------------------------------------------------
|
| Responsible for working with Promotion domain models.
|
| This service centralizes promotion logic so pages and components never
| implement discount rules themselves.
|
| Future responsibilities:
|
| • Store promotions
| • Product promotions
| • Coupon codes
| • Holiday campaigns
| • Flash sales
| • Scheduled promotions
| • Automatic expiration
|
*/

import type {
  Promotion,
} from "@/types/promotion";

/*
|--------------------------------------------------------------------------
| Promotion Service
|--------------------------------------------------------------------------
*/

export const promotionService = {
  /*
  |--------------------------------------------------------------------------
  | Is Promotion Active
  |--------------------------------------------------------------------------
  */

    isActive(
      promotion: Promotion | null | undefined,
      now: Date = new Date()
    ): boolean {
      if (!promotion) {
        return false;
      }

      /*
      * Legacy promotions may not have isActive.
      * Undefined is treated as enabled.
      */

      if (promotion.isActive === false) {
        return false;
      }

      /*
      * Invalid date strings should not accidentally activate a promotion.
      */

      if (promotion.startsAt) {
        const startsAt =
          new Date(promotion.startsAt);

        if (
          Number.isNaN(
            startsAt.getTime()
          ) ||
          now < startsAt
        ) {
          return false;
        }
      }

      if (promotion.endsAt) {
        const endsAt =
          new Date(promotion.endsAt);

        if (
          Number.isNaN(
            endsAt.getTime()
          ) ||
          now > endsAt
        ) {
          return false;
        }
      }

      return true;
    },

  /*
  |--------------------------------------------------------------------------
  | Get Discount Label
  |--------------------------------------------------------------------------
  */

  getLabel(
    promotion: Promotion | null | undefined
  ): string {
    if (!promotion) {
      return "";
    }

        switch (promotion.type) {
          case "discount":
      if (
        typeof promotion.discountPercentage ===
          "number" &&
        promotion.discountPercentage > 0
      ) {
        return `${promotion.discountPercentage}% Off`;
      }

      if (
        typeof promotion.discountAmount ===
          "number" &&
        promotion.discountAmount > 0
      ) {
        return `$${promotion.discountAmount.toFixed(
          2
        )} Off`;
      }

      return "Discount";

      case "bogo":
        return "Buy One Get One";

      case "free_shipping":
        return "Free Delivery";

      default:
        return "";
    }
  },

  /**
   * Returns the price a customer pays for an active discount promotion.
   * Regular product.price is never modified by a promotion.
   */
  getDiscountedPrice(
    price: number,
    promotion: Promotion | null | undefined
  ): number {
    if (
      !this.isActive(promotion) ||
      promotion?.type !== "discount" ||
      price <= 0
    ) {
      return price;
    }

    let discountedPrice = price;

    if (
      typeof promotion.discountPercentage === "number" &&
      promotion.discountPercentage > 0
    ) {
      discountedPrice = price * (1 - Math.min(promotion.discountPercentage, 100) / 100);
    } else if (
      typeof promotion.discountAmount === "number" &&
      promotion.discountAmount > 0
    ) {
      discountedPrice = price - promotion.discountAmount;
    }

    return Math.round(Math.max(0, discountedPrice) * 100) / 100;
  },
};
