export async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.src = url;
  await img.decode();
  return img;
}

export function fileToObjectUrl(file: File): string {
  return URL.createObjectURL(file);
}

export function revokeObjectUrl(url: string | null) {
  if (!url) return;
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}



