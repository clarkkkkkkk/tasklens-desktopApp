export async function createDemoScreenshot(): Promise<File> {
  // A locally rendered announcement fixture, not a generated brand asset or analyzed content.
  const canvas = document.createElement('canvas');
  canvas.width = 760;
  canvas.height = 440;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The sample preview is unavailable. Please upload an image.');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 760, 440);
  ctx.fillStyle = '#6B7280';
  ctx.font = '16px sans-serif';
  ctx.fillText('CLASS ANNOUNCEMENT  ·  OCTOBER 2026', 48, 58);
  ctx.fillStyle = '#171A1F';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText('Pictorial day', 48, 122);
  ctx.font = '21px sans-serif';
  [
    'Thursday, October 8 • Campus',
    'Please arrive by 1:30 PM.',
    'Wear black pants. No jeans.',
    'Exact pictorial time is still unconfirmed.',
    'Further information may be announced later.',
  ].forEach((line, i) => ctx.fillText(line, 48, 182 + i * 44));
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (blob) resolve(new File([blob], 'sample-announcement.png', { type: 'image/png' }));
      else reject(new Error('Could not create the sample image.'));
    }, 'image/png'),
  );
}
