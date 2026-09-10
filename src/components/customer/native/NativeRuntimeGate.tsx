"use client";

import {useCallback, useEffect, useState} from "react";
import {App} from "@capacitor/app";
import {Browser} from "@capacitor/browser";
import {Capacitor} from "@capacitor/core";
import {Keyboard, KeyboardResize} from "@capacitor/keyboard";
import {Network} from "@capacitor/network";
import {StatusBar, Style} from "@capacitor/status-bar";
import {Download, RefreshCw, ServerCrash, WifiOff} from "lucide-react";
import {reportClientIssue} from "@/services/monitoring/clientErrorReporter";
import {logNativeEvent} from "@/services/monitoring/nativeCrashReporter";
import {nativeResultFeedback} from "@/services/native/nativeInteractionService";
import {recordNativeAnalyticsEvent} from "@/services/monitoring/nativeAnalytics";

type UpdateState = "current" | "recommended" | "required";
interface ReleasePolicy {minimumVersion: string | null; latestVersion: string | null; storeUrl: string | null}

declare global {
  interface Window {
    __LIA_NATIVE__?: {
      handshakeVersion: number;
      platform: string;
      version: string;
      build: string;
      capabilities: Record<string, boolean>;
    };
  }
}

const capabilities = ["App", "Network", "Keyboard", "StatusBar", "Haptics", "Share", "Camera", "Badge", "FirebaseAuthentication", "FirebaseMessaging", "FirebaseCrashlytics", "FirebaseAnalytics", "FirebaseAppCheck"] as const;

function parts(version: string): number[] {
  return version.split(".").slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
}

function compare(left: string, right: string): number {
  const a = parts(left); const b = parts(right);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

export function NativeRuntimeGate() {
  const [connected, setConnected] = useState(true);
  const [checking, setChecking] = useState(false);
  const [serverUnavailable, setServerUnavailable] = useState(false);
  const [update, setUpdate] = useState<{state: UpdateState; url: string | null; version: string} | null>(null);

  const verifyServer = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch("/api/native/config", {cache: "no-store"});
      if (!response.ok) throw new Error(`Native configuration returned ${response.status}`);
      setServerUnavailable(false);
      return response;
    } catch (error) {
      setServerUnavailable(true);
      reportClientIssue({area: "native.server_health", message: "Hosted application health check failed", error});
      return null;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    const initialize = async () => {
      await StatusBar.setOverlaysWebView({overlay: false});
      await StatusBar.setStyle({style: Style.Dark});
      if (Capacitor.getPlatform() === "android") await StatusBar.setBackgroundColor({color: "#ffffff"});
      await Keyboard.setResizeMode({mode: KeyboardResize.Native});

      const [appInfo, network, response] = await Promise.all([App.getInfo(), Network.getStatus(), verifyServer()]);
      if (!active) return;
      setConnected(network.connected);
      const available = Object.fromEntries(capabilities.map((name) => [name, Capacitor.isPluginAvailable(name)]));
      window.__LIA_NATIVE__ = {handshakeVersion: 1, platform: Capacitor.getPlatform(), version: appInfo.version, build: appInfo.build, capabilities: available};
      window.dispatchEvent(new CustomEvent("lia:native-ready", {detail: window.__LIA_NATIVE__}));
      const missing = Object.entries(available).filter(([, value]) => !value).map(([name]) => name);
      logNativeEvent("startup", {platform: Capacitor.getPlatform(), version: appInfo.version, build: appInfo.build, connected: network.connected});
      recordNativeAnalyticsEvent("lia_native_startup", {platform: Capacitor.getPlatform(), version: appInfo.version, build: appInfo.build, connected: network.connected});
      if (missing.length) reportClientIssue({area: "native.capability_handshake", message: "Native capabilities are missing", metadata: {missing: missing.join(",")}});

      if (response) {
        const config = await response.json() as {handshakeVersion?: number; platforms?: Record<string, ReleasePolicy>};
        const policy = config.platforms?.[Capacitor.getPlatform()];
        const state: UpdateState = policy?.minimumVersion && compare(appInfo.version, policy.minimumVersion) < 0
          ? "required"
          : policy?.latestVersion && compare(appInfo.version, policy.latestVersion) < 0 ? "recommended" : "current";
        setUpdate({state, url: policy?.storeUrl ?? null, version: policy?.latestVersion ?? appInfo.version});
      }
    };
    void initialize().catch((error) => reportClientIssue({area: "native.startup", message: "Native runtime initialization failed", severity: "fatal", error}));

    const networkListener = Network.addListener("networkStatusChange", (status) => {
      setConnected(status.connected);
      if (status.connected) void verifyServer();
    });
    const keyboardShow = Keyboard.addListener("keyboardWillShow", () => document.documentElement.classList.add("native-keyboard-open"));
    const keyboardHide = Keyboard.addListener("keyboardWillHide", () => document.documentElement.classList.remove("native-keyboard-open"));
    return () => {
      active = false;
      void networkListener.then((handle) => handle.remove());
      void keyboardShow.then((handle) => handle.remove());
      void keyboardHide.then((handle) => handle.remove());
      document.documentElement.classList.remove("native-keyboard-open");
    };
  }, [verifyServer]);

  if (!Capacitor.isNativePlatform()) return null;
  if (!connected || serverUnavailable) {
    const offline = !connected;
    return <div className="fixed inset-0 z-[500] flex items-center justify-center bg-white px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-center"><section className="w-full max-w-sm"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orange-50 text-orange-600">{offline ? <WifiOff className="h-8 w-8"/> : <ServerCrash className="h-8 w-8"/>}</span><h1 className="mt-5 text-xl font-extrabold text-gray-900">{offline ? "Internet connection required" : "LIA is temporarily unavailable"}</h1><p className="mt-2 text-sm leading-6 text-gray-600">{offline ? "Check your connection and try again. Current prices, inventory, and orders require internet access." : "We couldn’t reach the LIA service. Your information is safe. Please try again."}</p><button type="button" disabled={checking} onClick={() => void verifyServer()} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-orange-500 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`}/>{checking ? "Checking…" : "Try again"}</button></section></div>;
  }
  if (update && update.state !== "current") {
    const required = update.state === "required";
    return <div className="fixed inset-0 z-[490] flex items-center justify-center bg-black/45 px-5"><section className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-orange-600"><Download className="h-7 w-7"/></span><h1 className="mt-4 text-xl font-extrabold text-gray-900">{required ? "Update required" : "A LIA update is available"}</h1><p className="mt-2 text-sm leading-6 text-gray-600">{required ? "Install the latest version to continue using LIA securely." : `Version ${update.version} includes the latest improvements.`}</p>{update.url ? <button type="button" onClick={() => { nativeResultFeedback("success"); void Browser.open({url: update.url!}); }} className="mt-5 min-h-12 w-full rounded-full bg-orange-500 px-5 py-3 text-sm font-bold text-white">Update LIA</button> : <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">The update is being published. Please try again shortly.</p>}{!required && <button type="button" onClick={() => setUpdate({...update, state: "current"})} className="mt-2 min-h-11 w-full rounded-full text-sm font-bold text-gray-600">Not now</button>}</section></div>;
  }
  return null;
}
