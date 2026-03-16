declare module 'wawoff2' {
  export function decompress(buffer: Buffer | Uint8Array): Promise<Uint8Array>;
  export function compress(buffer: Buffer | Uint8Array): Promise<Uint8Array>;
}
