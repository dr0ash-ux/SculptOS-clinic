import { supabase } from "./lib/supabase";
export type ClinicLetterhead = {
  name: string;
  address: string;
  phone: string;
  logo_path: string | null;
};
export async function loadClinicLetterhead(
  clinicId: string,
): Promise<ClinicLetterhead> {
  const r = await supabase
    .from("clinics")
    .select("name,address,phone,logo_path")
    .eq("id", clinicId)
    .single();
  if (r.error) throw r.error;
  return r.data;
}
export async function loadClinicLogo(path: string): Promise<string> {
  const r = await supabase.storage.from("clinic-logos").download(path);
  if (r.error) throw r.error;
  const url = URL.createObjectURL(r.data);
  try {
    await checkLogoImage(url);
    return url;
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}
function checkLogoImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (
        !img.naturalWidth ||
        img.naturalWidth > 4096 ||
        img.naturalHeight > 4096
      )
        reject(new Error("Choose a logo up to 4096 × 4096 pixels."));
      else resolve();
    };
    img.onerror = () =>
      reject(
        new Error(
          "The logo image could not be opened. Please upload a valid PNG, JPG or WebP.",
        ),
      );
    img.src = url;
  });
}
export async function uploadClinicLogo(
  clinicId: string,
  file: File,
): Promise<string> {
  const extension = (
    { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<
      string,
      string
    >
  )[file.type];
  if (!extension || file.size > 1048576 || !file.size)
    throw new Error("Choose a PNG, JPG or WebP logo no larger than 1 MB.");
  const preview = URL.createObjectURL(file);
  try {
    await checkLogoImage(preview);
  } finally {
    URL.revokeObjectURL(preview);
  }
  const path = `${clinicId}/${crypto.randomUUID()}.${extension}`;
  const r = await supabase.storage
    .from("clinic-logos")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (r.error) throw r.error;
  return path;
}
