export function incrementPatchVersion(version) {
  const parts = `${version}`.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  const [major, minor, patch] = parts.map((part) => Number.parseInt(part, 10));
  return `${major}.${minor}.${patch + 1}`;
}
