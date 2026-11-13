"use client";

import { createContext, useContext, type RefObject } from "react";
import type { Size, ViewportTransform } from "../lib/coordinates";

type ImageCanvasGeometry = {
  viewportRef: RefObject<HTMLDivElement>;
  imageSize: Size;
  viewportSize: Size;
  transform: ViewportTransform | null;
};

export const ImageCanvasContext = createContext<ImageCanvasGeometry | null>(
  null
);

export function useImageCanvas() {
  const canvas = useContext(ImageCanvasContext);
  if (!canvas) throw new Error("Image comments must be inside ImageCanvas");
  return canvas;
}
