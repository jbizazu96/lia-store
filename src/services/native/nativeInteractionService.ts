import {Capacitor} from "@capacitor/core";
import {Haptics, ImpactStyle, NotificationType} from "@capacitor/haptics";
import {Share} from "@capacitor/share";

export function nativeSelectionFeedback(): void {
  if (!Capacitor.isNativePlatform()) return;
  void Haptics.impact({style: ImpactStyle.Light}).catch(() => undefined);
}

export function nativeResultFeedback(result: "success" | "warning" | "error"): void {
  if (!Capacitor.isNativePlatform()) return;
  const type = result === "success" ? NotificationType.Success : result === "warning" ? NotificationType.Warning : NotificationType.Error;
  void Haptics.notification({type}).catch(() => undefined);
}

export async function shareLiaContent(input: {title: string; text: string; url: string}): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    await Share.share({...input, dialogTitle: input.title});
    return true;
  }
  if (navigator.share) {
    await navigator.share(input);
    return true;
  }
  await navigator.clipboard.writeText(input.url);
  return false;
}
