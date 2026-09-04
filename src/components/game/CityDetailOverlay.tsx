'use client';

import React, { useEffect, useRef } from 'react';
import { useGame } from '@/context/GameContext';
import { TILE_HEIGHT, TILE_WIDTH } from '@/components/game/types';
import { gridToScreen } from '@/components/game/utils';
import { getVisibleTileBounds } from '@/lib/performanceUtils';

export interface CityDetailOverlayProps {
  viewport: {
    offset: { x: number; y: number };
    zoom: number;
    canvasSize: { width: number; height: number };
  } | null;
  mobile?: boolean;
}

function hash2d(x: number, y: number, salt = 0): number {
  let value = Math.imul(x + 11 + salt * 101, 374761393) ^ Math.imul(y + 37 + salt * 17, 668265263);
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function isRoad(grid: ReturnType<typeof useGame>['state']['grid'], x: number, y: number): boolean {
  const type = grid[y]?.[x]?.building.type;
  return type === 'road' || (type === 'bridge' && grid[y]?.[x]?.building.bridgeTrackType !== 'rail');
}

/**
 * Lightweight decorative canvas rendered above the main game canvas.
 *
 * The layer deliberately stores no game state: street furniture is generated
 * deterministically from tile coordinates, so saves stay small and existing
 * cities immediately gain extra visual detail. It is viewport-culled and only
 * appears when zoomed in far enough to justify the extra drawing work.
 */
export function CityDetailOverlay({ viewport, mobile = false }: CityDetailOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { latestStateRef } = useGame();

  useEffect(() => {
    if (!viewport) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { zoom, offset, canvasSize } = viewport;
    const detailThreshold = mobile ? 1.15 : 0.82;
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
    const width = Math.max(1, Math.floor(canvasSize.width * dpr));
    const height = Math.max(1, Math.floor(canvasSize.height * dpr));

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (zoom < detailThreshold) return;

    const state = latestStateRef.current;
    const bounds = getVisibleTileBounds(
      offset,
      zoom,
      canvasSize.width,
      canvasSize.height,
      state.gridSize,
      TILE_WIDTH,
      TILE_HEIGHT,
    );

    ctx.save();
    ctx.scale(dpr * zoom, dpr * zoom);
    ctx.translate(offset.x / zoom, offset.y / zoom);
    ctx.lineCap = 'round';

    let detailsDrawn = 0;
    const detailLimit = mobile ? 180 : 700;

    for (let y = bounds.minTileY; y <= bounds.maxTileY && detailsDrawn < detailLimit; y += 1) {
      for (let x = bounds.minTileX; x <= bounds.maxTileX && detailsDrawn < detailLimit; x += 1) {
        const tile = state.grid[y]?.[x];
        if (!tile) continue;
        const { screenX, screenY } = gridToScreen(x, y, 0, 0);
        const centerX = screenX + TILE_WIDTH / 2;
        const centerY = screenY + TILE_HEIGHT / 2;

        if (tile.building.type === 'road') {
          const horizontal = isRoad(state.grid, x - 1, y) || isRoad(state.grid, x + 1, y);
          const vertical = isRoad(state.grid, x, y - 1) || isRoad(state.grid, x, y + 1);
          const seed = hash2d(x, y);

          // Street lamps: bright enough to make streets feel structured, but
          // deliberately sparse so they do not compete with moving vehicles.
          if (seed > 0.56) {
            const side = seed > 0.78 ? 1 : -1;
            const lampX = centerX + (horizontal && !vertical ? 0 : side * 18);
            const lampY = centerY + (horizontal && !vertical ? side * 10 : 0);
            ctx.strokeStyle = 'rgba(55, 65, 81, 0.88)';
            ctx.lineWidth = 1.35;
            ctx.beginPath();
            ctx.moveTo(lampX, lampY + 3);
            ctx.lineTo(lampX, lampY - 10);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255, 236, 178, 0.92)';
            ctx.beginPath();
            ctx.arc(lampX, lampY - 11, 1.8, 0, Math.PI * 2);
            ctx.fill();
            detailsDrawn += 1;
          }

          // Parked cars appear only on quieter-looking road tiles. They are
          // intentionally tiny isometric props rather than simulated vehicles.
          if (seed < 0.20 && (tile.traffic ?? 0) < 60) {
            ctx.save();
            ctx.translate(centerX + (vertical ? 15 : -10), centerY + (vertical ? 2 : 8));
            ctx.rotate(horizontal && !vertical ? -0.43 : 0.43);
            ctx.fillStyle = ['#64748b', '#a16207', '#475569', '#7f1d1d'][Math.floor(hash2d(x, y, 4) * 4) % 4];
            ctx.fillRect(-4, -2, 8, 4);
            ctx.fillStyle = 'rgba(191, 219, 254, 0.65)';
            ctx.fillRect(-1.5, -1.5, 3, 3);
            ctx.restore();
            detailsDrawn += 1;
          }

          // Bike racks around dense development: a small but recognisable
          // detail, especially for the Dutch Urbanism AutoMode strategy.
          if (seed > 0.88) {
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.82)';
            ctx.lineWidth = 0.9;
            for (let bike = 0; bike < 2; bike += 1) {
              const bx = centerX - 14 + bike * 5;
              const by = centerY + 11;
              ctx.beginPath();
              ctx.arc(bx - 1.5, by, 1.5, 0, Math.PI * 2);
              ctx.arc(bx + 1.5, by, 1.5, 0, Math.PI * 2);
              ctx.moveTo(bx - 1.5, by);
              ctx.lineTo(bx, by - 2.5);
              ctx.lineTo(bx + 1.5, by);
              ctx.stroke();
            }
            detailsDrawn += 1;
          }
        }

        if ((tile.building.type === 'park' || tile.building.type === 'park_large') && hash2d(x, y, 8) > 0.35) {
          // Benches / picnic furniture make parks less visually empty without
          // needing another sprite atlas.
          ctx.fillStyle = 'rgba(112, 78, 49, 0.92)';
          ctx.fillRect(centerX - 7, centerY + 5, 13, 2.5);
          ctx.strokeStyle = 'rgba(64, 48, 36, 0.9)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(centerX - 5, centerY + 7);
          ctx.lineTo(centerX - 5, centerY + 10);
          ctx.moveTo(centerX + 4, centerY + 7);
          ctx.lineTo(centerX + 4, centerY + 10);
          ctx.stroke();
          detailsDrawn += 1;
        }

        if (zoom >= 1.25 && !['grass', 'empty', 'water', 'road', 'rail', 'bridge', 'tree'].includes(tile.building.type)) {
          // Rooftop solar hint on a deterministic subset of completed modern
          // buildings. This is purely decorative and therefore save-compatible.
          if (tile.building.constructionProgress >= 100 && hash2d(x, y, 12) > 0.78) {
            ctx.save();
            ctx.translate(centerX + 2, centerY - 21);
            ctx.rotate(-0.43);
            ctx.fillStyle = 'rgba(30, 58, 85, 0.8)';
            ctx.fillRect(-5, -2.5, 10, 5);
            ctx.strokeStyle = 'rgba(147, 197, 253, 0.55)';
            ctx.lineWidth = 0.6;
            ctx.strokeRect(-5, -2.5, 10, 5);
            ctx.restore();
            detailsDrawn += 1;
          }
        }
      }
    }

    ctx.restore();
  }, [latestStateRef, mobile, viewport]);

  if (!viewport) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-[9] pointer-events-none"
      aria-hidden="true"
    />
  );
}
