import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import {
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithCredential,
  signInWithPopup,
  type User,
  type UserCredential,
} from "firebase/auth";

import { auth } from "@/lib/firebase";

async function nativeGoogleCredential() {
  const result = await FirebaseAuthentication.signInWithGoogle({
    scopes: ["email", "profile"],
  });
  const idToken = result.credential?.idToken;
  const accessToken = result.credential?.accessToken;

  if (!idToken && !accessToken) {
    throw new Error("Google did not return a usable authentication credential.");
  }

  return GoogleAuthProvider.credential(
    idToken || null,
    accessToken || null,
  );
}

export const googleAuthenticationService = {
  async signIn(): Promise<UserCredential> {
    if (!Capacitor.isNativePlatform()) {
      return signInWithPopup(auth, new GoogleAuthProvider());
    }

    return signInWithCredential(auth, await nativeGoogleCredential());
  },

  async reauthenticate(user: User): Promise<UserCredential> {
    if (!Capacitor.isNativePlatform()) {
      return reauthenticateWithPopup(user, new GoogleAuthProvider());
    }

    return reauthenticateWithCredential(
      user,
      await nativeGoogleCredential(),
    );
  },
};
