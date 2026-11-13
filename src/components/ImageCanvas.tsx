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
  const [imageStatus, setImageStatus] = useState<
    "loading" | "loaded" | "error"
  >("loading");
  const [imageAttempt, setImageAttempt] = useState(0);

  function imageFailed() {
    setImageStatus("error");
    setImageSize({ width: 0, height: 0 });
  }

  function imageLoaded(image: HTMLImageElement) {
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      imageFailed();
      return;
    }
    setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    setImageStatus("loaded");
  }

  useEffect(() => {
    // Handle both successful and failed loads that finished before hydration.
    const image = imageRef.current;
    if (image?.complete) imageLoaded(image);
  }, [imageAttempt]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

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
    focusAnchor,
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
        <div className="review-header-status">
          <span className="review-badge">Shared canvas</span>
          <div id="online-collaborators" />
          <span id="collaboration-indicator" />
        </div>
      </header>
      <div className="review-workspace">
        <div
          ref={viewportRef}
          className="image-viewport"
          role="region"
          aria-label="Image review canvas"
          aria-describedby="canvas-instructions"
          aria-busy={imageStatus === "loading"}
          data-canvas-surface
          data-panning={isPanning || undefined}
          {...viewportHandlers}
        >
          <img
            key={imageAttempt}
            ref={imageRef}
            className="canvas-image"
            src={
              imageAttempt === 0
                ? "/review-board.svg"
                : `/review-board.svg?retry=${imageAttempt}`
            }
            alt="Alpine escape travel design with an illustrated mountain landscape"
            draggable={false}
            data-canvas-surface
            onLoad={(event) => imageLoaded(event.currentTarget)}
            onError={imageFailed}
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
          {imageStatus === "loading" && (
            <div className="image-notice" role="status">
              Loading image…
            </div>
          )}
          {imageStatus === "error" && (
            <div className="image-notice" role="alert">
              <strong>The image could not be loaded</strong>
              <span>Check your connection and try again.</span>
              <button
                type="button"
                onClick={() => {
                  setImageStatus("loading");
                  setImageAttempt((attempt) => attempt + 1);
                  resetView();
                }}
              >
                Retry image
              </button>
            </div>
          )}
          <ImageCanvasContext.Provider
            value={{
              viewportRef,
              imageSize,
              transform,
              viewportSize,
              focusAnchor,
            }}
          >
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
        <div id="comments-sidebar" />
      </div>
      <footer className="review-footer">
        <span id="canvas-instructions">
          Click to comment · Drag to pan · Use + and − to zoom
        </span>
        <span>Powered by Liveblocks</span>
      </footer>
    </main>
  );
}
