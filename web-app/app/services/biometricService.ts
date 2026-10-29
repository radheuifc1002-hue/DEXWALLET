const CREDENTIAL_KEY = "xu_biometric_credential_id";

function generateChallenge(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const isBiometricAvailable = async (): Promise<boolean> => {
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
};

export const registerBiometric = async (): Promise<boolean> => {
  try {
    const challenge = generateChallenge();
    const userId = crypto.getRandomValues(new Uint8Array(16));

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: "XU Wallet",
          id: window.location.hostname,
        },
        user: {
          id: userId,
          name: "xu-wallet-user",
          displayName: "XU Wallet User",
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },
          { alg: -257, type: "public-key" },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "discouraged",
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) return false;

    const credentialId = arrayBufferToBase64(credential.rawId);
    localStorage.setItem(CREDENTIAL_KEY, credentialId);
    return true;
  } catch (e) {
    console.error("Biometric registration failed:", e);
    return false;
  }
};

export const authenticateWithBiometric = async (): Promise<boolean> => {
  try {
    const credentialIdBase64 = localStorage.getItem(CREDENTIAL_KEY);
    if (!credentialIdBase64) return false;

    const challenge = generateChallenge();
    const credentialId = base64ToUint8Array(credentialIdBase64);

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [
          {
            id: credentialId,
            type: "public-key",
            transports: ["internal"],
          },
        ],
        userVerification: "required",
        timeout: 60000,
      },
    });

    return !!assertion;
  } catch (e) {
    console.error("Biometric authentication failed:", e);
    return false;
  }
};

export const clearBiometricCredential = () => {
  localStorage.removeItem(CREDENTIAL_KEY);
};
