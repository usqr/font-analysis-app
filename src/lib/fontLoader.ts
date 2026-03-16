const loaded = new Map<string, FontFace>();

function mimeForFormat(format: string): string {
  switch (format) {
    case 'woff2': return 'font/woff2';
    case 'woff':  return 'font/woff';
    case 'otf':   return 'font/opentype';
    default:      return 'font/truetype';
  }
}

export async function registerFont(
  id: string,
  _familyName: string,
  base64Data: string,
  format: string,
): Promise<FontFace> {
  if (loaded.has(id)) return loaded.get(id)!;

  const mime = mimeForFormat(format);
  const url = `url(data:${mime};base64,${base64Data})`;
  const face = new FontFace(`fa-${id}`, url);
  await face.load();
  document.fonts.add(face);
  loaded.set(id, face);
  return face;
}

export function unregisterFont(id: string): void {
  const face = loaded.get(id);
  if (face) {
    document.fonts.delete(face);
    loaded.delete(id);
  }
}

export function isRegistered(id: string): boolean {
  return loaded.has(id);
}

export function unregisterAll(): void {
  for (const [id, face] of loaded) {
    document.fonts.delete(face);
    loaded.delete(id);
  }
}
