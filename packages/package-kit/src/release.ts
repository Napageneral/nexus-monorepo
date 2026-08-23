import { createPackageArchive, type PackageArchiveOptions } from "./shared.js";

export async function releasePackage(targetPath: string, options: PackageArchiveOptions = {}) {
  return await createPackageArchive(targetPath, options);
}
