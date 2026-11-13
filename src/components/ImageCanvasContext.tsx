"use client";

import { createContext, useContext } from "react";
import type { Size, ViewportTransform } from "../lib/coordinates";

type ImageCanvasGeometry = {
  imageSize: Size;
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
