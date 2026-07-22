"use client";

/*
|--------------------------------------------------------------------------
| Product Promotion Section
|--------------------------------------------------------------------------
|
| Reusable promotion editor for ProductForm.
|
| Responsibilities:
|
| - Select promotion type.
| - Enable or disable the promotion.
| - Set percentage or fixed discounts.
| - Set start and expiration dates.
| - Edit the customer-facing title and description.
|
| This component contains no Firestore logic.
|
*/

import type {
  ChangeEvent,
} from "react";

import {
  Gift,
} from "lucide-react";

import {
  PRODUCT_PROMOTION_TYPES,
} from "@/config/productFormOptions";

import type {
  Promotion,
} from "@/types/promotion";

/*
|--------------------------------------------------------------------------
| Props
|--------------------------------------------------------------------------
*/

interface ProductPromotionSectionProps {
  promotion: Promotion | null;

  onChange: (
    promotion: Promotion | null
  ) => void;
}

/*
|--------------------------------------------------------------------------
| Component
|--------------------------------------------------------------------------
*/

export function ProductPromotionSection({
  promotion,
  onChange,
}: ProductPromotionSectionProps) {
  /*
  |--------------------------------------------------------------------------
  | Helpers
  |--------------------------------------------------------------------------
  */

  const updatePromotion = (
    updates: Partial<Promotion>
  ) => {
    if (!promotion) {
      return;
    }

    onChange({
      ...promotion,
      ...updates,
    });
  };

  const handleTypeChange = (
    event:
      ChangeEvent<HTMLSelectElement>
  ) => {
    const value =
      event.target.value;

    if (!value) {
      onChange(null);
      return;
    }

    const type =
      value as Promotion["type"];

    const selectedOption =
      PRODUCT_PROMOTION_TYPES.find(
        (option) =>
          option.value === type
      );

    onChange({
      id:
        promotion?.id ??
        `promotion-${Date.now()}`,

      title:
        promotion?.title ??
        selectedOption?.label ??
        "Promotion",

      description:
        promotion?.description ?? "",

      imageUrl:
        promotion?.imageUrl ?? "",

      type,

      isActive:
        promotion?.isActive ??
        true,

      startsAt:
        promotion?.startsAt ??
        null,

      endsAt:
        promotion?.endsAt ??
        null,

      discountPercentage:
        type === "discount"
          ? promotion
              ?.discountPercentage
          : undefined,

      discountAmount:
        type === "discount"
          ? promotion
              ?.discountAmount
          : undefined,
    });
  };

  /*
  |--------------------------------------------------------------------------
  | Empty State
  |--------------------------------------------------------------------------
  */

  if (!promotion) {
    return (
      <div className="rounded-xl border border-dashed border-orange-300 bg-orange-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Gift className="mt-0.5 h-5 w-5 text-orange-600" />

            <div>
              <p className="font-medium text-gray-800">
                No promotion added
              </p>

              <p className="text-sm text-gray-500">
                Add a discount, BOGO,
                or free-delivery
                promotion.
              </p>
            </div>
          </div>

          <select
            value=""
            onChange={
              handleTypeChange
            }
            className="rounded-xl border border-orange-200 bg-white px-4 py-2 text-sm focus:ring-2 focus:ring-orange-500"
          >
            <option value="">
              Add Promotion
            </option>

            {PRODUCT_PROMOTION_TYPES.map(
              (option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              )
            )}
          </select>
        </div>
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Promotion Editor
  |--------------------------------------------------------------------------
  */

  return (
    <div className="space-y-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-orange-600" />

          <div>
            <p className="font-medium text-gray-800">
              Product Promotion
            </p>

            <p className="text-xs text-gray-500">
              Configure how this
              promotion appears and when
              it is active.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            onChange(null)
          }
          className="self-start text-sm font-medium text-red-600 transition hover:text-red-700 sm:self-auto"
        >
          Remove Promotion
        </button>
      </div>

      {/* Type and Active */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Promotion Type
          </label>

          <select
            value={promotion.type}
            onChange={
              handleTypeChange
            }
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 focus:ring-2 focus:ring-orange-500"
          >
            {PRODUCT_PROMOTION_TYPES.map(
              (option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              )
            )}
          </select>
        </div>

        <div className="flex items-end">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={
                promotion.isActive !==
                false
              }
              onChange={(event) =>
                updatePromotion({
                  isActive:
                    event.target
                      .checked,
                })
              }
              className="h-4 w-4 rounded text-orange-500 focus:ring-orange-500"
            />

            Promotion Enabled
          </label>
        </div>
      </div>

      {/* Title and Description */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Promotion Title
          </label>

          <input
            type="text"
            value={promotion.title}
            onChange={(event) =>
              updatePromotion({
                title:
                  event.target.value,
              })
            }
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 focus:ring-2 focus:ring-orange-500"
            placeholder="e.g., Summer Sale"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Description
          </label>

          <input
            type="text"
            value={
              promotion.description
            }
            onChange={(event) =>
              updatePromotion({
                description:
                  event.target.value,
              })
            }
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 focus:ring-2 focus:ring-orange-500"
            placeholder="Describe the promotion"
          />
        </div>
      </div>

      {/* Discount Fields */}
      {promotion.type ===
        "discount" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Discount Percentage
            </label>

            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={
                promotion
                  .discountPercentage ??
                ""
              }
              onChange={(event) => {
                const value =
                  Number.parseFloat(
                    event.target.value
                  );

                updatePromotion({
                  discountPercentage:
                    Number.isFinite(
                      value
                    )
                      ? value
                      : undefined,

                  discountAmount:
                    undefined,
                });
              }}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 focus:ring-2 focus:ring-orange-500"
              placeholder="e.g., 20"
            />

            <p className="mt-1 text-xs text-gray-400">
              Use either percentage or
              fixed amount.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Fixed Discount ($)
            </label>

            <input
              type="number"
              min="0"
              step="0.01"
              value={
                promotion
                  .discountAmount ?? ""
              }
              onChange={(event) => {
                const value =
                  Number.parseFloat(
                    event.target.value
                  );

                updatePromotion({
                  discountAmount:
                    Number.isFinite(
                      value
                    )
                      ? value
                      : undefined,

                  discountPercentage:
                    undefined,
                });
              }}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 focus:ring-2 focus:ring-orange-500"
              placeholder="e.g., 5.00"
            />
          </div>
        </div>
      )}

      {/* Dates */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Starts At
          </label>

          <input
            type="datetime-local"
            value={
              promotion.startsAt
                ? promotion.startsAt.slice(
                    0,
                    16
                  )
                : ""
            }
            onChange={(event) =>
              updatePromotion({
                startsAt:
                  event.target.value
                    ? new Date(
                        event.target.value
                      ).toISOString()
                    : null,
              })
            }
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Ends At
          </label>

          <input
            type="datetime-local"
            value={
              promotion.endsAt
                ? promotion.endsAt.slice(
                    0,
                    16
                  )
                : ""
            }
            onChange={(event) =>
              updatePromotion({
                endsAt:
                  event.target.value
                    ? new Date(
                        event.target.value
                      ).toISOString()
                    : null,
              })
            }
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>
    </div>
  );
}