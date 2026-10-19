export const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
export async function readScreenshot(file: File): Promise<string> {
  if (!allowedTypes.includes(file.type) || !/\.(png|jpe?g|webp)$/i.test(file.name))
    throw new Error('Choose a PNG, JPG, JPEG, or WEBP image.');
  if (file.size > MAX_FILE_SIZE)
    throw new Error('This image is too large. Choose an image smaller than 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.width || !img.height) throw new Error('No image dimensions');
    const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image preview unavailable');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let thumbnail = canvas.toDataURL('image/jpeg', 0.72);
    if (thumbnail.length > 350000) thumbnail = canvas.toDataURL('image/jpeg', 0.4);
    if (thumbnail.length > 400000) throw new Error('Image is too complex');
    return thumbnail;
  } catch {
    throw new Error(
      'This image could not be previewed. Try a smaller image or export it as PNG/JPG.',
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
/**
 * A downscaled JPEG for image-capable models. Only called when the router chose such a model
 * and the privacy policy allows sending the image.
 */
export async function encodeImageForAI(
  image: Blob,
  maxSide = 1600,
): Promise<{ mimeType: 'image/jpeg'; base64: string }> {
  const url = URL.createObjectURL(image);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('The screenshot could not be prepared.');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { mimeType: 'image/jpeg', base64: dataUrl.slice(dataUrl.indexOf(',') + 1) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function downloadText(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
