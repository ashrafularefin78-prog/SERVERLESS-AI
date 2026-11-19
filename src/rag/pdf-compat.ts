// pdf.js 6 fingerprints files with the new Uint8Array hex/base64 helpers. They
// are not available in every browser yet, and the fingerprint is computed
// inside the parser's Worker, so the shim has to be installed in both realms.
// These are local implementations of the proposal's methods: no dependency and
// no network access.

interface Base64Options {
  alphabet?: "base64" | "base64url";
  omitPadding?: boolean;
}

type HexArray = Uint8Array & { toHex?: () => string };
type Base64Array = Uint8Array & { toBase64?: (options?: Base64Options) => string };
type Base64Constructor = Uint8ArrayConstructor & {
  fromBase64?: (value: string, options?: Base64Options) => Uint8Array;
};

export function installBinaryHelpers(): void {
  const proto = Uint8Array.prototype as HexArray & Base64Array;

  if (typeof proto.toHex !== "function") {
    proto.toHex = function toHex(this: Uint8Array): string {
      let hex = "";
      for (const byte of this) hex += byte.toString(16).padStart(2, "0");
      return hex;
    };
  }

  if (typeof proto.toBase64 !== "function") {
    proto.toBase64 = function toBase64(this: Uint8Array, options?: Base64Options): string {
      let binary = "";
      const chunk = 0x2000;

      for (let index = 0; index < this.length; index += chunk) {
        binary += String.fromCharCode(...this.subarray(index, index + chunk));
      }

      let encoded = btoa(binary);
      if (options?.alphabet === "base64url") {
        encoded = encoded.replace(/\+/g, "-").replace(/\//g, "_");
      }
      if (options?.omitPadding) encoded = encoded.replace(/=+$/, "");
      return encoded;
    };
  }

  const ctor = Uint8Array as Base64Constructor;
  if (typeof ctor.fromBase64 !== "function") {
    ctor.fromBase64 = (value: string, options?: Base64Options): Uint8Array => {
      let encoded = value.replace(/[\t\n\f\r ]/g, "");
      if (options?.alphabet === "base64url") {
        encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
      }

      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    };
  }
}
