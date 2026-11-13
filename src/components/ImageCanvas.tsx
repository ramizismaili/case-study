"use client";

import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import type { Size } from "../lib/coordinates";
import { ImageCanvasContext } from "./ImageCanvasContext";
import { useCanvasView } from "../hooks/useCanvasView";
import { ZoomControls } from "./ZoomControls";

export function ImageCanvas({ children }: PropsWithChildren) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [viewportSize, setViewportSize] = useState<Size>({
    width: 0,
    height: 0,
  });
  const [imageSize, setImageSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    // A cached image can finish loading before React hydrates the server HTML.
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    }

    const observer = new ResizeObserver(([entry]) => {
      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const {
    transform,
    zoom,
    isPanning,
    zoomIn,
    zoomOut,
    resetView,
    viewportHandlers,
  } = useCanvasView(imageSize, viewportSize);

  return (
    <main className="review-app">
      <header className="review-header">
        <div className="review-title">
          <span className="review-mark" aria-hidden="true">
            ir
          </span>
          <div>
            <h1>Image Review</h1>
            <p>Alpine escape · Design review</p>
          </div>
        </div>
        <span className="review-badge">Shared canvas</span>
      </header>
      <div
        ref={viewportRef}
        className="image-viewport"
        role="region"
        aria-label="Image review canvas"
        data-canvas-surface
        data-panning={isPanning || undefined}
        {...viewportHandlers}
      >
        <img
          ref={imageRef}
          className="canvas-image"
          src="/review-board.svg"
          alt="Alpine escape travel design with an illustrated mountain landscape"
          draggable={false}
          data-canvas-surface
          onLoad={(event) => {
            setImageSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            });
          }}
          style={
            transform
              ? {
                  width: imageSize.width * transform.scale,
                  height: imageSize.height * transform.scale,
                  transform: `translate(${transform.origin.x}px, ${transform.origin.y}px)`,
                }
              : { visibility: "hidden" }
          }
        />
        <ImageCanvasContext.Provider value={{ imageSize, transform }}>
          {children}
        </ImageCanvasContext.Provider>
        <ZoomControls
          zoom={zoom}
          disabled={!transform || isPanning}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onReset={resetView}
        />
        <span className="canvas-caption">Alpine escape / Cover concept</span>
      </div>
      <footer className="review-footer">
        <span>One image. A shared conversation.</span>
        <span>Powered by Liveblocks</span>
      </footer>
    </main>
  );
}
