/** Build-time policy only. A sample remains available, but a production provider cannot be mock. */
export function assertReleaseEnvironment(environment) {
  if (environment.VITE_TASKLENS_EXTRACTION?.trim().toLowerCase() === 'mock')
    throw new Error(
      'Production builds cannot use mock extraction. Use the labelled sample or browser tests.',
    );
  if (
    Object.keys(environment).some((key) =>
      /^VITE_.*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key),
    )
  )
    throw new Error(
      'Credential-like VITE variables are forbidden: Vite embeds them in public frontend bundles.',
    );
}
