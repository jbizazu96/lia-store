"use client";

/*
|--------------------------------------------------------------------------
| useCheckout Hook
|--------------------------------------------------------------------------
|
| Loads and manages the base data required by the checkout page.
|
| Responsibilities:
| - Wait for Firebase Authentication.
| - Load the customer's profile and default address.
| - Load the store connected to the current cart.
| - Prepare the delivery-address form.
| - Manage the address modal.
|
| Pricing, address saving, and order creation will be moved into separate
| hooks so this hook remains focused on loading checkout data.
|
*/

import {
  useEffect,
  useState,
} from "react";

import {
  onAuthStateChanged,
} from "firebase/auth";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import {
  auth,
  db,
} from "@/lib/firebase";

import {
  storeService,
} from "@/services/store/storeService";

import type {
  Store,
} from "@/types/store";

import type {
  CheckoutAddress,
} from "@/app/checkout/types";

/*
|--------------------------------------------------------------------------
| Address Form Data
|--------------------------------------------------------------------------
*/

export interface CheckoutAddressFormData {
  street: string;
  city: string;
  state: string;
  zip: string;
  name: string;
  phone: string;
}

/*
|--------------------------------------------------------------------------
| Hook Parameters
|--------------------------------------------------------------------------
*/

interface UseCheckoutParams {
  storeId?: string;
}

/*
|--------------------------------------------------------------------------
| Hook Result
|--------------------------------------------------------------------------
*/

interface UseCheckoutResult {
  address: CheckoutAddress | null;

  store: Store | null;

  userName: string;

  userPhone: string;

  formData: CheckoutAddressFormData;

  showAddressModal: boolean;

  loading: boolean;

  error: string | null;

  isAuthenticated: boolean;

  setAddress: (
    address: CheckoutAddress | null
  ) => void;

  setUserName: (
    name: string
  ) => void;

  setUserPhone: (
    phone: string
  ) => void;

  setFormData: React.Dispatch<
    React.SetStateAction<CheckoutAddressFormData>
  >;

  setShowAddressModal: (
    show: boolean
  ) => void;

  setError: (
    error: string | null
  ) => void;
}

/*
|--------------------------------------------------------------------------
| Empty Address Form
|--------------------------------------------------------------------------
*/

const EMPTY_ADDRESS_FORM:
CheckoutAddressFormData = {
  street: "",
  city: "",
  state: "",
  zip: "",
  name: "",
  phone: "",
};

/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function useCheckout({
  storeId,
}: UseCheckoutParams): UseCheckoutResult {
  const [
    address,
    setAddress,
  ] = useState<CheckoutAddress | null>(
    null
  );

  const [
    store,
    setStore,
  ] = useState<Store | null>(null);

  const [
    userName,
    setUserName,
  ] = useState("");

  const [
    userPhone,
    setUserPhone,
  ] = useState("");

  const [
    formData,
    setFormData,
  ] = useState<CheckoutAddressFormData>(
    EMPTY_ADDRESS_FORM
  );

  const [
    showAddressModal,
    setShowAddressModal,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const [
    isAuthenticated,
    setIsAuthenticated,
  ] = useState(false);

  /*
  |--------------------------------------------------------------------------
  | Load Customer And Store
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    let isMounted = true;

    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {
          if (!user) {
            if (isMounted) {
              setAddress(null);
              setStore(null);
              setIsAuthenticated(false);
              setLoading(false);

              setError(
                "You must sign in to continue."
              );
            }

            return;
          }

          if (isMounted) {
            setIsAuthenticated(true);
            setLoading(true);
            setError(null);
          }

          try {
            /*
            |--------------------------------------------------------------------------
            | Load Customer Profile
            |--------------------------------------------------------------------------
            */

            const userSnapshot =
              await getDoc(
                doc(
                  db,
                  "users",
                  user.uid
                )
              );

            let resolvedName =
              user.email?.split("@")[0] ??
              "Customer";

            let resolvedPhone = "";

            let defaultAddress:
              | CheckoutAddress
              | null = null;

            if (userSnapshot.exists()) {
              const userData =
                userSnapshot.data();

              if (
                typeof userData.displayName ===
                  "string" &&
                userData.displayName.trim()
              ) {
                resolvedName =
                  userData.displayName;
              }

              if (
                typeof userData.phone ===
                "string"
              ) {
                resolvedPhone =
                  userData.phone;
              }

              if (userData.defaultAddress) {
                defaultAddress = {
                  street:
                    userData.defaultAddress
                      .street ?? "",

                  city:
                    userData.defaultAddress
                      .city ?? "",

                  state:
                    userData.defaultAddress
                      .state ?? "",

                  zip:
                    userData.defaultAddress
                      .zip ?? "",

                  latitude:
                    userData.defaultAddress
                      .latitude,

                  longitude:
                    userData.defaultAddress
                      .longitude,

                  formattedAddress:
                    userData.defaultAddress
                      .formattedAddress ?? "",
                };
              }
            }

            /*
            |--------------------------------------------------------------------------
            | Load Store
            |--------------------------------------------------------------------------
            */

            const loadedStore =
              storeId
                ? await storeService.getStore(
                    storeId
                  )
                : null;

            if (!isMounted) {
              return;
            }

            setUserName(resolvedName);
            setUserPhone(resolvedPhone);
            setAddress(defaultAddress);
            setStore(loadedStore);

            setFormData({
              street:
                defaultAddress?.street ?? "",

              city:
                defaultAddress?.city ?? "",

              state:
                defaultAddress?.state ?? "",

              zip:
                defaultAddress?.zip ?? "",

              name: resolvedName,

              phone: resolvedPhone,
            });

            if (
              storeId &&
              !loadedStore
            ) {
              setError(
                "The selected store could not be loaded."
              );
            }
          } catch (loadError) {
            console.error(
              "Error loading checkout data:",
              loadError
            );

            if (isMounted) {
              setAddress(null);
              setStore(null);

              setError(
                "Failed to load checkout information."
              );
            }
          } finally {
            if (isMounted) {
              setLoading(false);
            }
          }
        }
      );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [storeId]);

  return {
    address,
    store,
    userName,
    userPhone,
    formData,
    showAddressModal,
    loading,
    error,
    isAuthenticated,
    setAddress,
    setUserName,
    setUserPhone,
    setFormData,
    setShowAddressModal,
    setError,
  };
}