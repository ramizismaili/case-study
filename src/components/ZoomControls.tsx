import { MIN_ZOOM, MAX_ZOOM } from "../lib/canvas-view";

type ZoomControlsProps = {
  zoom: number;
  disabled: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
};

export function ZoomControls({
  zoom,
  disabled,
  onZoomIn,
  onZoomOut,
  onReset,
}: ZoomControlsProps) {
  return (
    <div
      className="zoom-controls"
      role="group"
      aria-label="Canvas view controls"
    >
      <button
        type="button"
        aria-label="Zoom out"
        disabled={disabled || zoom <= MIN_ZOOM}
        onClick={onZoomOut}
      >
        −
      </button>
      <output aria-label="Zoom level" title="Zoom relative to the fitted image">
        {Math.round(zoom * 100)}%
      </output>
      <button
        type="button"
        aria-label="Zoom in"
        disabled={disabled || zoom >= MAX_ZOOM}
        onClick={onZoomIn}
      >
        +
      </button>
      <button
        type="button"
        className="reset-view"
        disabled={disabled}
        onClick={onReset}
      >
        Reset view
      </button>
    </div>
  );
}
