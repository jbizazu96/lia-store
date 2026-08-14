import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";

export const authEmailService = {
  async requestVerification(): Promise<{accepted: boolean; alreadyVerified: boolean}> {
    const callable = httpsCallable<undefined, {accepted: boolean; alreadyVerified: boolean}>(
      functions,
      "requestVerificationEmail",
    );
    return (await callable()).data;
  },

  async requestPasswordReset(email: string): Promise<void> {
    const callable = httpsCallable<{email: string}, {accepted: boolean}>(
      functions,
      "requestPasswordResetEmail",
    );
    await callable({email: email.trim()});
  },
};
