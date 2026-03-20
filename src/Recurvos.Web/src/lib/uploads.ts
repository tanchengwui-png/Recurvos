import type { PlatformUploadPolicy } from "../types";

export const DEFAULT_UPLOAD_POLICY: PlatformUploadPolicy = {
  autoCompressUploads: true,
  uploadMaxBytes: 2_000_000,
  uploadImageMaxDimension: 1600,
  uploadImageQuality: 80,
};

export function formatUploadSizeLabel(bytes: number) {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(bytes % 1_000_000 === 0 ? 0 : 1)} MB`;
  }

  return `${Math.round(bytes / 1_000)} KB`;
}

export async function prepareImageUpload(file: File, policy: PlatformUploadPolicy) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image uploads are allowed.");
  }

  if (!policy.autoCompressUploads && file.size <= policy.uploadMaxBytes) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, policy.uploadImageMaxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Image compression is not supported in this browser.");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const originalBaseName = file.name.replace(/\.[^.]+$/, "");
  const qualitySteps = [policy.uploadImageQuality / 100, 0.78, 0.68, 0.58];
  const targetTypes = file.type === "image/webp"
    ? ["image/webp", "image/jpeg"]
    : ["image/webp", "image/jpeg"];

  let bestCandidate: File | null = null;

  for (const type of targetTypes) {
    for (const quality of qualitySteps) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
      if (!blob) {
        continue;
      }

      const extension = type === "image/webp" ? "webp" : "jpg";
      const candidate = new File([blob], `${originalBaseName}.${extension}`, {
        type,
        lastModified: file.lastModified,
      });

      if (!bestCandidate || candidate.size < bestCandidate.size) {
        bestCandidate = candidate;
      }

      if (candidate.size <= policy.uploadMaxBytes) {
        return candidate;
      }
    }
  }

  if (file.size <= policy.uploadMaxBytes) {
    return file;
  }

  if (bestCandidate) {
    return bestCandidate;
  }

  throw new Error(`Image must be ${formatUploadSizeLabel(policy.uploadMaxBytes)} or smaller.`);
}
