export { validatePackageRoot } from "./shared.js";
import { validatePackageRoot } from "./shared.js";

export function validatePackage(targetPath: string) {
  return validatePackageRoot(targetPath);
}
