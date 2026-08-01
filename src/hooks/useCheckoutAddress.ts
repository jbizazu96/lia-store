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
} from "@/lib/firebase";
import {
  customerProfileClientService,
} from "@/services/user/customerProfileClientService";
import { useConfirmation } from "@/context/ConfirmationContext";
import { useSuccessToast } from "@/context/SuccessToastContext";
import { normalizeUsState } from "@/utils/usState";

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

      const normalizedState = normalizeUsState(formData.state);

      if (!normalizedState) {
        setError("Enter a valid U.S. state name or two-letter abbreviation.");
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

      const address = await customerProfileClientService.saveDefaultAddress({
        street: formData.street,
        city: formData.city,
        state: normalizedState,
        zip: formData.zip,
      }) as CheckoutAddress;

      await customerProfileClientService.updateProfile({
        displayName: formData.name,
        phone: formData.phone,
      });

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
