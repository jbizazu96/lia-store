import {Capacitor} from "@capacitor/core";
import {FirebaseAuthentication} from "@capacitor-firebase/authentication";
import {
  OAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  revokeAccessToken,
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
  const authorizationCode = result.credential?.authorizationCode?.trim() ?? "";
  if (!idToken) {
    throw new Error("Apple did not return a usable authentication credential.");
  }
  return {
    credential: appleProvider().credential({idToken, rawNonce}),
    authorizationCode,
  };
}

export const appleAuthenticationService = {
  async signIn(): Promise<UserCredential> {
    if (!Capacitor.isNativePlatform()) {
      return signInWithPopup(auth, appleProvider());
    }
    const {credential} = await nativeAppleCredential();
    return signInWithCredential(auth, credential);
  },

  async reauthenticate(user: User): Promise<{
    credential: UserCredential;
    authorizationCode: string | null;
  }> {
    if (!Capacitor.isNativePlatform()) {
      return {
        credential: await reauthenticateWithPopup(user, appleProvider()),
        authorizationCode: null,
      };
    }
    const nativeCredential = await nativeAppleCredential();
    return {
      credential: await reauthenticateWithCredential(user, nativeCredential.credential),
      authorizationCode: nativeCredential.authorizationCode || null,
    };
  },

  async revokeAuthorizationCode(authorizationCode: string): Promise<void> {
    const code = authorizationCode.trim();
    if (!code) {
      throw new Error("Apple did not return the authorization needed to revoke access.");
    }
    await revokeAccessToken(auth, code);
  },
};
