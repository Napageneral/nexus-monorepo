import { createPackageArchive } from "./shared.js";

export async function releasePackage(targetPath: string) {
  return await createPackageArchive(targetPath);
}
