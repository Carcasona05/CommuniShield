import React, { useState } from "react";
import ReportPhotoGrid from "./ReportPhotoGrid";
import FullscreenImageViewer from "./FullscreenImageViewer";
import { reportImageList } from "../services/reportImageSource";

export default function ReportPhotoGallery({ images, height = 220 }) {
  const [index, setIndex] = useState(null);
  const list = reportImageList(images);
  return <>
    <ReportPhotoGrid images={list} height={height} onPress={setIndex} />
    {index !== null && <FullscreenImageViewer images={list} initialIndex={index} visible onClose={() => setIndex(null)} />}
  </>;
}
