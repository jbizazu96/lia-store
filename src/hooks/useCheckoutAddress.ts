"use client";

/*
|--------------------------------------------------------------------------
| useCheckoutAddress Hook
|--------------------------------------------------------------------------
|
| Handles saving the customer's delivery address to Firestore.
|
| This hook is responsible only for updating the user's saved delivery
| information. It does not load checkout data or place orders.
|
*/

import { useState } from "react";

import {
  auth,
  db,
} from "@/lib/firebase";

import {
  doc,
  setDoc,
} from "firebase/firestore";

import { geocodeAddress } from "@/services/delivery/geocode";
import { useConfirmation } from "@/context/ConfirmationContext";
import { useSuccessToast } from "@/context/SuccessToastContext";

import type {
  CheckoutAddress,
} from "@/app/checkout/types";

import type {
  CheckoutAddressFormData,
} from "./useCheckout";

/*
|--------------------------------------------------------------------------
| Hook Result
|--------------------------------------------------------------------------
*/

interface UseCheckoutAddressResult {
  loading: boolean;

  error: string | null;

  saveAddress: (
    formData: CheckoutAddressFormData
  ) => Promise<CheckoutAddress | null>;

  clearError: () => void;
}

/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function useCheckoutAddress():
UseCheckoutAddressResult {
  const { confirm } = useConfirmation();
  const { showSuccess } = useSuccessToast();
  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  async function saveAddress(
    formData: CheckoutAddressFormData
  ): Promise<CheckoutAddress | null> {
    if (
      !formData.street.trim() ||
      !formData.city.trim() ||
      !formData.state.trim() ||
      !formData.zip.trim() ||
      !formData.name.trim() ||
      !formData.phone.trim()
    ) {
      setError(
        "Please fill in all fields."
      );

      return null;
    }

    try {
      setLoading(true);
      setError(null);

      const user =
        auth.currentUser;

      if (!user) {
        throw new Error(
          "User not signed in."
        );
      }

      const fullAddress = `${formData.street}, ${formData.city}, ${formData.state} ${formData.zip}`;

      const result = await geocodeAddress(
        fullAddress
      );

      if (!result) {
        setError(
          "We couldn't verify that delivery address. Check the street, city, state, and ZIP code, then try again."
        );
        return null;
      }

      const confirmed = await confirm({
        title: "Save delivery address?",
        message: "This verified address will be used to calculate delivery.",
        confirmLabel: "Save address",
        cancelLabel: "Keep editing",
      });

      if (!confirmed) {
        return null;
      }

      const address: CheckoutAddress =
        {
          street:
            formData.street.trim().toUpperCase(),

          city:
            formData.city.trim().toUpperCase(),

          state:
            formData.state.trim().toUpperCase(),

          zip:
            formData.zip.trim().toUpperCase(),

          latitude:
            result.latitude,

          longitude:
            result.longitude,

          formattedAddress:
            result.formattedAddress.toUpperCase(),
        };

      await setDoc(
        doc(
          db,
          "users",
          user.uid
        ),
        {
          defaultAddress:
            address,

          displayName:
            formData.name,

          phone:
            formData.phone,
        },
        {
          merge: true,
        }
      );

      showSuccess("Delivery address saved.");

      return address;
    } catch (saveError) {
      console.error(
        "Error saving address:",
        saveError
      );

      setError(
        "Failed to save address."
      );

      return null;
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    error,
    saveAddress,

    clearError: () =>
      setError(null),
  };
}
