import type { ReactNode } from "react";
import { AgStudioAiModule, AgStudioLicenseManager } from "ag-studio";
import { AgStudioProvider } from "ag-studio-react";

const modules = [AgStudioAiModule];

/** Mount around the planned Studio panel, not the whole buyer application.
 * Module registration alone does not connect Gemini or send AI requests.
 * Vite embeds this browser licence at build time; provider API secrets never belong here.
 */
export function AgStudioScope({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const licenseKey = import.meta.env.VITE_AG_STUDIO_LICENSE_KEY?.trim();
  if (!licenseKey) return <>{fallback}</>;
  const details = AgStudioLicenseManager.getLicenseDetails(
    licenseKey,
    new Set(["CORE", "PRO", "PRO-AI"]),
  );
  if (
    !details.valid ||
    details.incorrectLicenseType ||
    details.expired ||
    details.trialExpired
  )
    return <>{fallback}</>;
  return (
    <AgStudioProvider licenseKey={licenseKey} modules={modules}>
      {children}
    </AgStudioProvider>
  );
}
