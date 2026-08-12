export type OutsideImageFitEvidence = {
  contract_version: "forge.outside-image-contain-fit.v1";
  fit_mode: "contain";
  source_width: number;
  source_height: number;
  target_width: number;
  target_height: number;
  rendered_width: number;
  rendered_height: number;
  offset_x: number;
  offset_y: number;
  scale: number;
  background: "near_black";
};

export function calculateOutsideImageContainFit(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): OutsideImageFitEvidence {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("Image and frame dimensions must be positive.");
  }
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const renderedWidth = Math.max(1, Math.round(sourceWidth * scale));
  const renderedHeight = Math.max(1, Math.round(sourceHeight * scale));
  return {
    contract_version: "forge.outside-image-contain-fit.v1",
    fit_mode: "contain",
    source_width: sourceWidth,
    source_height: sourceHeight,
    target_width: targetWidth,
    target_height: targetHeight,
    rendered_width: renderedWidth,
    rendered_height: renderedHeight,
    offset_x: Math.floor((targetWidth - renderedWidth) / 2),
    offset_y: Math.floor((targetHeight - renderedHeight) / 2),
    scale,
    background: "near_black",
  };
}

export const prepareOutsideImageForFrame = prepareOutsideThumbnailImage;

export async function prepareOutsideThumbnailImage(
  file: File,
  targetWidth: number,
  targetHeight: number,
): Promise<{ bytes: Uint8Array; mimeType: "image/png"; fitEvidence: OutsideImageFitEvidence }> {
  const bitmap = await createImageBitmap(file);
  try {
    const fitEvidence = calculateOutsideImageContainFit(bitmap.width, bitmap.height, targetWidth, targetHeight);
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare the uploaded image.");
    context.fillStyle = "#050914";
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      bitmap,
      fitEvidence.offset_x,
      fitEvidence.offset_y,
      fitEvidence.rendered_width,
      fitEvidence.rendered_height,
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("The fitted image could not be encoded."))),
        "image/png",
      ),
    );
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: "image/png", fitEvidence };
  } finally {
    bitmap.close();
  }
}
