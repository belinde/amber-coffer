import type { CampaignImage, ClipRegion, ImageRef } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../../components/ui/Button.js';
import { resolveImageDisplayUrlAsync } from '../../../components/ui/resolve-local-image-url.js';

type CampaignImageId = CampaignImage['id'];

export interface TokenClipEditorProps {
  campaignImageId: CampaignImageId;
  campaignId: CampaignImage['campaignId'];
  imageRef: ImageRef;
  clipRegion: ClipRegion | null;
  onConfirm: (clip: ClipRegion) => void;
  onRemove: () => void;
  disabled?: boolean;
}

const MIN_HALF_SIDE = 0.05;
const DEFAULT_HALF_SIDE = 0.25;
const KEYBOARD_STEP = 0.01;
const RESIZE_STEP = 0.01;

/** Clamp a clip region so the square stays within image bounds. */
export function clampClipRegion(
  centerX: number,
  centerY: number,
  halfSide: number,
  naturalW?: number,
  naturalH?: number,
): ClipRegion {
  const hs = Math.max(MIN_HALF_SIDE, Math.min(halfSide, 0.5));

  // halfSide is relative to min(w,h).
  // The square occupies halfSide * min(w,h) pixels on each side of center.
  // As a fraction of width: halfSide * min(w,h) / w
  // As a fraction of height: halfSide * min(w,h) / h
  let marginX = hs;
  let marginY = hs;
  if (naturalW && naturalH && naturalW > 0 && naturalH > 0) {
    const minDim = Math.min(naturalW, naturalH);
    marginX = (hs * minDim) / naturalW;
    marginY = (hs * minDim) / naturalH;
  }

  const cx = Math.max(marginX, Math.min(centerX, 1 - marginX));
  const cy = Math.max(marginY, Math.min(centerY, 1 - marginY));
  return { centerX: cx, centerY: cy, halfSide: hs };
}

/**
 * Convert clip region to pixel rect on the rendered image.
 * halfSide is relative to min(naturalW, naturalH).
 */
function clipToPixelRect(
  clip: ClipRegion,
  renderedW: number,
  renderedH: number,
  naturalW: number,
  naturalH: number,
): { x: number; y: number; size: number } {
  const minDim = Math.min(naturalW, naturalH);
  // Square side in natural pixels
  const sidePx = clip.halfSide * 2 * minDim;
  // Center in natural pixels
  const cxPx = clip.centerX * naturalW;
  const cyPx = clip.centerY * naturalH;
  // Scale from natural to rendered
  const scaleX = renderedW / naturalW;
  const scaleY = renderedH / naturalH;
  // Rendered square
  const size = sidePx * Math.min(scaleX, scaleY);
  // Use the actual scale per axis for center positioning
  const x = cxPx * scaleX - size / 2;
  const y = cyPx * scaleY - size / 2;
  return { x, y, size };
}

export function TokenClipEditor({
  campaignId,
  imageRef,
  clipRegion,
  onConfirm,
  onRemove,
  disabled = false,
}: TokenClipEditorProps): ReactElement {
  const { t } = useTranslation();

  const [clip, setClip] = useState<ClipRegion>(
    () => clipRegion ?? clampClipRegion(0.5, 0.5, DEFAULT_HALF_SIDE),
  );
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [renderedSize, setRenderedSize] = useState<{ w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState<'move' | 'resize' | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; startClip: ClipRegion } | null>(
    null,
  );

  // Resolve image URL for display
  useEffect(() => {
    let cancelled = false;
    void resolveImageDisplayUrlAsync(campaignId, imageRef).then((url) => {
      if (!cancelled) setImageSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [campaignId, imageRef]);

  // Sync external clipRegion prop changes
  useEffect(() => {
    if (clipRegion) {
      setClip(clipRegion);
    }
  }, [clipRegion]);

  // Track rendered image size (updates on load and resize)
  const updateRenderedSize = useCallback(() => {
    const img = imgRef.current;
    if (img && img.clientWidth > 0 && img.clientHeight > 0) {
      setRenderedSize({ w: img.clientWidth, h: img.clientHeight });
    }
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver(updateRenderedSize);
    const img = imgRef.current;
    if (img) observer.observe(img);
    return () => observer.disconnect();
  }, [updateRenderedSize, imageSrc]);

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      updateRenderedSize();
    },
    [updateRenderedSize],
  );

  /**
   * Convert a pixel delta on the rendered image to a delta in normalized clip coords.
   */
  const pxToNormalized = useCallback(
    (dxPx: number, dyPx: number): { dx: number; dy: number } => {
      if (!renderedSize || !naturalSize) return { dx: 0, dy: 0 };
      return {
        dx: dxPx / renderedSize.w,
        dy: dyPx / renderedSize.h,
      };
    },
    [renderedSize, naturalSize],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, mode: 'move' | 'resize') => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(mode);
      dragStartRef.current = { startX: e.clientX, startY: e.clientY, startClip: { ...clip } };
    },
    [clip, disabled],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !dragStartRef.current || !renderedSize || !naturalSize) return;
      const { startClip } = dragStartRef.current;

      if (dragging === 'move') {
        const { dx, dy } = pxToNormalized(
          e.clientX - dragStartRef.current.startX,
          e.clientY - dragStartRef.current.startY,
        );
        setClip(
          clampClipRegion(
            startClip.centerX + dx,
            startClip.centerY + dy,
            startClip.halfSide,
            naturalSize.w,
            naturalSize.h,
          ),
        );
      } else {
        // Resize: compute distance from center in normalized coords, convert to halfSide
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const posXPx = e.clientX - rect.left;
        const posYPx = e.clientY - rect.top;
        // Position as fraction of image
        const posX = posXPx / renderedSize.w;
        const posY = posYPx / renderedSize.h;
        // Distance from center in image-fraction space
        const distXFrac = Math.abs(posX - startClip.centerX);
        const distYFrac = Math.abs(posY - startClip.centerY);
        // Convert to halfSide (which is relative to min(w,h))
        const minDim = Math.min(naturalSize.w, naturalSize.h);
        const hsFromX = (distXFrac * naturalSize.w) / minDim;
        const hsFromY = (distYFrac * naturalSize.h) / minDim;
        const newHalfSide = Math.max(hsFromX, hsFromY);
        setClip(
          clampClipRegion(
            startClip.centerX,
            startClip.centerY,
            newHalfSide,
            naturalSize.w,
            naturalSize.h,
          ),
        );
      }
    },
    [dragging, renderedSize, naturalSize, pxToNormalized],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (dragging) {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        setDragging(null);
        dragStartRef.current = null;
      }
    },
    [dragging],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      let handled = true;
      let next = { ...clip };
      const nw = naturalSize?.w;
      const nh = naturalSize?.h;

      switch (e.key) {
        case 'ArrowLeft':
          next = clampClipRegion(clip.centerX - KEYBOARD_STEP, clip.centerY, clip.halfSide, nw, nh);
          break;
        case 'ArrowRight':
          next = clampClipRegion(clip.centerX + KEYBOARD_STEP, clip.centerY, clip.halfSide, nw, nh);
          break;
        case 'ArrowUp':
          next = clampClipRegion(clip.centerX, clip.centerY - KEYBOARD_STEP, clip.halfSide, nw, nh);
          break;
        case 'ArrowDown':
          next = clampClipRegion(clip.centerX, clip.centerY + KEYBOARD_STEP, clip.halfSide, nw, nh);
          break;
        case '+':
        case '=':
          next = clampClipRegion(clip.centerX, clip.centerY, clip.halfSide + RESIZE_STEP, nw, nh);
          break;
        case '-':
          next = clampClipRegion(clip.centerX, clip.centerY, clip.halfSide - RESIZE_STEP, nw, nh);
          break;
        default:
          handled = false;
      }

      if (handled) {
        e.preventDefault();
        setClip(next);
      }
    },
    [clip, disabled, naturalSize],
  );

  if (disabled) {
    return (
      <div className="token-clip-editor token-clip-editor--disabled">
        <p className="token-clip-editor__message">{t('tabletop.clipEditor.noImage')}</p>
      </div>
    );
  }

  // Compute overlay position in pixels on the rendered image
  const overlay =
    renderedSize && naturalSize
      ? clipToPixelRect(clip, renderedSize.w, renderedSize.h, naturalSize.w, naturalSize.h)
      : null;

  // Preview: use object-position and object-fit to show the exact clipped region
  // We scale the image so the clipped square fills the 80×80 preview frame.
  const previewStyle = naturalSize
    ? (() => {
        const minDim = Math.min(naturalSize.w, naturalSize.h);
        const sidePx = clip.halfSide * 2 * minDim;
        // Top-left of clip in natural pixels
        const clipLeftPx = clip.centerX * naturalSize.w - sidePx / 2;
        const clipTopPx = clip.centerY * naturalSize.h - sidePx / 2;
        // Scale factor: preview frame is 80px, clip region is sidePx natural pixels
        const scale = 80 / sidePx;
        const imgW = naturalSize.w * scale;
        const imgH = naturalSize.h * scale;
        const offsetX = -clipLeftPx * scale;
        const offsetY = -clipTopPx * scale;
        return {
          width: `${String(imgW)}px`,
          height: `${String(imgH)}px`,
          marginLeft: `${String(offsetX)}px`,
          marginTop: `${String(offsetY)}px`,
          maxWidth: 'none',
        } as const;
      })()
    : undefined;

  return (
    <div className="token-clip-editor">
      <div className="token-clip-editor__workspace">
        {/* Main image with overlay */}
        <div
          ref={containerRef}
          className="token-clip-editor__image-container"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          role="application"
          aria-label={t('tabletop.clipEditor.editorAria')}
          aria-roledescription={t('tabletop.clipEditor.editorRoleDescription')}
        >
          {imageSrc ? (
            <img
              ref={imgRef}
              src={imageSrc}
              alt={t('tabletop.clipEditor.sourceImageAlt')}
              className="token-clip-editor__source-image"
              draggable={false}
              onLoad={handleImageLoad}
            />
          ) : null}

          {/* Clip overlay — positioned in pixels to be a perfect square */}
          {overlay ? (
            <div
              className="token-clip-editor__overlay"
              style={{
                left: `${String(overlay.x)}px`,
                top: `${String(overlay.y)}px`,
                width: `${String(overlay.size)}px`,
                height: `${String(overlay.size)}px`,
              }}
              onPointerDown={(e) => handlePointerDown(e, 'move')}
              aria-hidden="true"
            >
              <div
                className="token-clip-editor__resize-handle"
                onPointerDown={(e) => handlePointerDown(e, 'resize')}
              />
            </div>
          ) : null}
        </div>

        {/* Live preview — shows exactly the clipped square in a circular frame */}
        <div className="token-clip-editor__preview">
          <p className="token-clip-editor__preview-label">
            {t('tabletop.clipEditor.previewLabel')}
          </p>
          {imageSrc && previewStyle ? (
            <div className="token-clip-editor__preview-frame">
              <img
                src={imageSrc}
                alt={t('tabletop.clipEditor.previewAlt')}
                className="token-clip-editor__preview-image"
                style={previewStyle}
                draggable={false}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Action buttons */}
      <div className="token-clip-editor__actions">
        <Button type="button" variant="primary" onClick={() => onConfirm(clip)}>
          {t('tabletop.clipEditor.confirm')}
        </Button>
        {clipRegion ? (
          <Button type="button" variant="danger" onClick={onRemove}>
            {t('tabletop.clipEditor.remove')}
          </Button>
        ) : null}
      </div>

      {/* Keyboard hint */}
      <p className="token-clip-editor__hint">{t('tabletop.clipEditor.keyboardHint')}</p>
    </div>
  );
}
