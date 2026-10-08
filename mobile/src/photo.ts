import { versBase64 } from "../../src/sync/crypto";
import type { PhotoSaisie } from "../../src/sync/protocole";

/**
 * Réduit et recompresse la photo d'un ticket (JPEG, 1600 px max) : lisible
 * pour un justificatif, mais légère à stocker et à synchroniser.
 */
export async function compresserPhoto(f: File, max = 1600, qualite = 0.8): Promise<PhotoSaisie> {
  const image = await createImageBitmap(f);
  const r = Math.min(1, max / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * r);
  canvas.height = Math.round(image.height * r);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Traitement de la photo impossible.");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const blob = await new Promise<Blob>((ok, ko) =>
    canvas.toBlob((b) => (b ? ok(b) : ko(new Error("Compression de la photo impossible."))), "image/jpeg", qualite)
  );
  return { type: "image/jpeg", base64: versBase64(new Uint8Array(await blob.arrayBuffer())) };
}

export function urlPhoto(p: PhotoSaisie): string {
  return `data:${p.type};base64,${p.base64}`;
}
