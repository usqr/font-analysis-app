import type { FullAnalysis, FontData } from '../types';

export function exportAnalysisJSON(
  fontData: FontData,
  analysis: FullAnalysis,
): void {
  const exportData = {
    font: {
      familyName: fontData.familyName,
      styleName: fontData.styleName,
      unitsPerEm: fontData.unitsPerEm,
      ascender: fontData.ascender,
      descender: fontData.descender,
      glyphCount: fontData.glyphCount,
    },
    analysis: {
      contrast: {
        lowercase: analysis.contrastLower
          ? {
              maxWidth: analysis.contrastLower.maxWidth,
              minWidth: analysis.contrastLower.minWidth,
              contrastRatio: analysis.contrastLower.contrastRatio,
            }
          : null,
        uppercase: analysis.contrastUpper
          ? {
              maxWidth: analysis.contrastUpper.maxWidth,
              minWidth: analysis.contrastUpper.minWidth,
              contrastRatio: analysis.contrastUpper.contrastRatio,
            }
          : null,
      },
      xHeight: analysis.xHeight,
      proportions: analysis.proportions,
      weight: analysis.weight
        ? {
            fillRatio: analysis.weight.fillRatio,
            fillPercentage: analysis.weight.fillPercentage,
          }
        : null,
      spacing: analysis.spacing
        ? {
            testString: analysis.spacing.testString,
            ratio: analysis.spacing.ratio,
            avgCharWidth: analysis.spacing.avgCharWidth,
          }
        : null,
    },
    exportedAt: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: 'application/json',
  });
  downloadBlob(blob, `${fontData.familyName}-analysis.json`);
}

export async function exportCanvasAsAvif(
  canvas: HTMLCanvasElement,
  fontName: string,
  tabName: string,
): Promise<void> {
  const supportsAvif = await checkAvifSupport();
  const mimeType = supportsAvif ? 'image/avif' : 'image/png';
  const ext = supportsAvif ? 'avif' : 'png';

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          downloadBlob(blob, `${fontName}-${tabName}.${ext}`);
        }
        resolve();
      },
      mimeType,
      0.9,
    );
  });
}

async function checkAvifSupport(): Promise<boolean> {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const dataUrl = canvas.toDataURL('image/avif');
  return dataUrl.startsWith('data:image/avif');
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
