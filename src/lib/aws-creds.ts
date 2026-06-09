// Browser-only AWS credential vault. Keys live in sessionStorage and are
// only sent over HTTPS to our server fn for the duration of a scan.
// Never persisted server-side.

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

const KEY = "cirrus.aws.creds.v1";

export function saveCreds(c: AwsCredentials) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify(c));
}

export function loadCreds(): AwsCredentials | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AwsCredentials;
  } catch {
    return null;
  }
}

export function clearCreds() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY);
}
