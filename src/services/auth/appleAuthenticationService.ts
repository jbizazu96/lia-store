import {Capacitor} from "@capacitor/core";
import {FirebaseAuthentication} from "@capacitor-firebase/authentication";
import {
  OAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithCredential,
  signInWithPopup,
  type User,
  type UserCredential,
} from "firebase/auth";
import {auth} from "@/lib/firebase";

function appleProvider(): OAuthProvider {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  return provider;
}

async function nativeAppleCredential() {
  const result = await FirebaseAuthentication.signInWithApple({
    skipNativeAuth: true,
    scopes: ["email", "name"],
  });
  const idToken = result.credential?.idToken;
  const rawNonce = result.credential?.nonce;
  if (!idToken) {
    throw new Error("Apple did not return a usable authentication credential.");
  }
  return appleProvider().credential({
    idToken,
    rawNonce,
  });
}

export const appleAuthenticationService = {
  async signIn(): Promise<UserCredential> {
    if (!Capacitor.isNativePlatform()) {
      return signInWithPopup(auth, appleProvider());
    }
    return signInWithCredential(auth, await nativeAppleCredential());
  },

  async reauthenticate(user: User): Promise<UserCredential> {
    if (!Capacitor.isNativePlatform()) {
      return reauthenticateWithPopup(user, appleProvider());
    }
    return reauthenticateWithCredential(user, await nativeAppleCredential());
  },
};
