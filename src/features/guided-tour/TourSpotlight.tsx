import type { Rect } from './tourGeometry';

export function TourSpotlight({ target }: { target: Rect | null }) {
  const x = target?.x ?? 0,
    y = target?.y ?? 0;
  const right = x + (target?.width ?? 0),
    bottom = y + (target?.height ?? 0);
  return (
    <div className="tour-shade" aria-hidden="true">
      <div className="tour-shade-piece" style={{ top: 0, left: 0, width: '100%', height: y }} />
      <div className="tour-shade-piece" style={{ top: y, left: 0, width: x, height: bottom - y }} />
      <div
        className="tour-shade-piece"
        style={{ top: y, left: right, right: 0, height: bottom - y }}
      />
      <div
        className="tour-shade-piece"
        style={{ top: bottom, left: 0, width: '100%', bottom: 0 }}
      />
      {target && (
        <div
          className="tour-spotlight"
          data-tour-target
          style={{ left: x, top: y, width: target.width, height: target.height }}
        />
      )}
    </div>
  );
}
