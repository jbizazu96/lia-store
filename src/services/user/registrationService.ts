/*
|--------------------------------------------------------------------------
| Registration Service
|--------------------------------------------------------------------------
|
| Keeps account creation and the initial Firestore profile outside of the
| registration UI. The page only collects input and displays the result.
|
*/

import {
  createUserWithEmailAndPassword,
  deleteUser,
  signOut,
} from "firebase/auth";

import {
  httpsCallable,
} from "firebase/functions";

import {
  auth,
  functions,
} from "@/lib/firebase";
import {authEmailService} from "@/services/auth/authEmailService";
import {invalidateCached} from "@/services/cache/clientDataCache";

export type RegistrationAccountType =
  | "customer"
  | "store_owner"
  | "driver";

export interface RegistrationInput {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  accountType: RegistrationAccountType;
  customerTermsAccepted?: boolean;
  customerPrivacyAcknowledged?: boolean;
}

export interface SocialCustomerProfileInput {
  fullName: string;
  phone: string;
  customerTermsAccepted: boolean;
  customerPrivacyAcknowledged: boolean;
}

interface InitializeUserProfileInput {
  fullName: string;
  phone: string;
  accountType: RegistrationAccountType;
  customerTermsAccepted?: boolean;
  customerPrivacyAcknowledged?: boolean;
}

/*
|--------------------------------------------------------------------------
| Create Account
|--------------------------------------------------------------------------
|
| Creates the Authentication account, its matching user profile, sends the
| verification email, and signs the new user out until they verify it.
|
*/
export const registrationService = {
  async initializeSocialCustomer(
    input: SocialCustomerProfileInput,
  ): Promise<void> {
    if (!auth.currentUser) {
      throw new Error("Sign in with Google or Apple before completing your profile.");
    }

    const initializeProfile = httpsCallable<
      InitializeUserProfileInput,
      { created: boolean; accountType: RegistrationAccountType }
    >(functions, "initializeUserProfile");

    await initializeProfile({
      fullName: input.fullName,
      phone: input.phone,
      accountType: "customer",
      customerTermsAccepted: input.customerTermsAccepted,
      customerPrivacyAcknowledged: input.customerPrivacyAcknowledged,
    });
    invalidateCached("current-account");
  },

  async register(input: RegistrationInput): Promise<void> {
    const result = await createUserWithEmailAndPassword(
      auth,
      input.email.trim(),
      input.password
    );

    const user = result.user;
    let profileInitialized = false;

    try {
      /*
        The callable owns the initial profile write. The registration UI
        never writes user role, lifecycle, or verification fields directly.
      */
      const initializeProfile = httpsCallable<
        InitializeUserProfileInput,
        { created: boolean; accountType: RegistrationAccountType }
      >(
        functions,
        "initializeUserProfile"
      );

      await initializeProfile({
        fullName: input.fullName,
        phone: input.phone,
        accountType: input.accountType,
        customerTermsAccepted: input.customerTermsAccepted,
        customerPrivacyAcknowledged: input.customerPrivacyAcknowledged,
      });

      profileInitialized = true;

      await authEmailService.requestVerification();
    } catch (error) {
      /*
        If profile initialization fails, remove the just-created Auth user so
        the person does not get stuck with an account missing its profile.
        Do not delete an account once the server has successfully initialized
        its profile; a sign-in can safely resend a failed verification email.
      */
      if (!profileInitialized) {
        try {
          await deleteUser(user);
        } catch (deletionError) {
          console.error(
            "Unable to remove incomplete registration account:",
            deletionError
          );
        }
      }

      throw error;
    } finally {
      // A newly registered user must verify their email before using any
      // protected route, even if sending the verification email fails.
      await signOut(auth);
    }
  },
};
