import {Camera, CameraDirection, CameraResultType, CameraSource, EncodingType, MediaTypeSelection} from "@capacitor/camera";
import {Capacitor} from "@capacitor/core";

export type NativeImageSource = "camera" | "gallery" | "prompt";

function extension(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/heic") return "heic";
  if (contentType === "image/heif") return "heif";
  return "jpg";
}

export async function selectNativeImage(source: NativeImageSource): Promise<File | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const result = source === "prompt"
    ? await Camera.getPhoto({
        quality: 88,
        width: 2048,
        height: 2048,
        correctOrientation: true,
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt,
        saveToGallery: false,
      })
    : source === "camera"
    ? await Camera.takePhoto({
        quality: 88,
        targetWidth: 2048,
        targetHeight: 2048,
        correctOrientation: true,
        encodingType: EncodingType.JPEG,
        saveToGallery: false,
        cameraDirection: CameraDirection.Rear,
      })
    : (await Camera.chooseFromGallery({
        mediaType: MediaTypeSelection.Photo,
        allowMultipleSelection: false,
        limit: 1,
        quality: 88,
        targetWidth: 2048,
        targetHeight: 2048,
        correctOrientation: true,
      })).results[0];

  if (!result?.webPath) return null;
  const response = await fetch(result.webPath);
  const blob = await response.blob();
  const contentType = blob.type || "image/jpeg";
  return new File([blob], `lia-${source}-${Date.now()}.${extension(contentType)}`, {type: contentType});
}
