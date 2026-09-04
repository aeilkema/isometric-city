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
  const tile = grid[y]?.[x];
  const type = tile?.building.type;
  return type === 'road' || (type === 'bridge' && tile?.building.bridgeTrackType !== 'rail');
}

function isDeveloped(type: string): boolean {
  return !['grass', 'empty', 'water', 'road', 'rail', 'bridge', 'tree'].includes(type);
}

function drawBike(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.beginPath();
  ctx.arc(x - 2 * scale, y, 1.7 * scale, 0, Math.PI * 2);
  ctx.arc(x + 2 * scale, y, 1.7 * scale, 0, Math.PI * 2);
  ctx.moveTo(x - 2 * scale, y);
  ctx.lineTo(x, y - 2.8 * scale);
  ctx.lineTo(x + 2 * scale, y);
  ctx.moveTo(x, y - 2.8 * scale);
  ctx.lineTo(x + 0.7 * scale, y - 4.3 * scale);
  ctx.stroke();
}

function drawStreetTree(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.strokeStyle = 'rgba(77, 56, 39, 0.95)';
  ctx.lineWidth = Math.max(0.8, size * 0.12);
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.45);
  ctx.lineTo(x, y - size * 0.25);
  ctx.stroke();
  ctx.fillStyle = 'rgba(59, 130, 78, 0.90)';
  ctx.beginPath();
  ctx.arc(x, y - size * 0.5, size * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(91, 157, 88, 0.65)';
  ctx.beginPath();
  ctx.arc(x - size * 0.16, y - size * 0.68, size * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Procedural high-detail layer rendered above the legacy sprite canvas.
 *
 * It adds a visibly more contemporary public realm without adding thousands of
 * persistent entities to the save file. Everything is deterministic from tile
 * coordinates, viewport-culled and therefore immediately applies to old cities.
 */
export function CityDetailOverlay({ viewport, mobile = false }: CityDetailOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { latestStateRef } = useGame();

  useEffect(() => {
    if (!viewport) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { zoom, offset, canvasSize } = viewport;
    const detailThreshold = mobile ? 0.92 : 0.58;
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.35 : 1.8);
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
    ctx.lineJoin = 'round';

    let detailsDrawn = 0;
    const detailLimit = mobile ? 320 : 1350;

    for (let y = bounds.minTileY; y <= bounds.maxTileY && detailsDrawn < detailLimit; y += 1) {
      for (let x = bounds.minTileX; x <= bounds.maxTileX && detailsDrawn < detailLimit; x += 1) {
        const tile = state.grid[y]?.[x];
        if (!tile) continue;

        const { screenX, screenY } = gridToScreen(x, y, 0, 0);
        const centerX = screenX + TILE_WIDTH / 2;
        const centerY = screenY + TILE_HEIGHT / 2;
        const type = tile.building.type;
        const seed = hash2d(x, y);

        if (type === 'road') {
          const west = isRoad(state.grid, x - 1, y);
          const east = isRoad(state.grid, x + 1, y);
          const north = isRoad(state.grid, x, y - 1);
          const south = isRoad(state.grid, x, y + 1);
          const horizontal = west || east;
          const vertical = north || south;
          const intersection = Number(west) + Number(east) + Number(north) + Number(south) >= 3;

          // Crisp lane markings make the road network visibly less flat.
          ctx.strokeStyle = 'rgba(245, 236, 190, 0.62)';
          ctx.lineWidth = 1.05;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          if (horizontal && !vertical) {
            ctx.moveTo(centerX - 20, centerY + 9);
            ctx.lineTo(centerX + 20, centerY - 9);
          } else if (vertical && !horizontal) {
            ctx.moveTo(centerX - 20, centerY - 9);
            ctx.lineTo(centerX + 20, centerY + 9);
          } else if (!intersection) {
            const choose = seed > 0.5;
            ctx.moveTo(centerX - 17, centerY + (choose ? 8 : -8));
            ctx.lineTo(centerX + 17, centerY + (choose ? -8 : 8));
          }
          ctx.stroke();
          ctx.setLineDash([]);
          detailsDrawn += 1;

          // Sidewalk edge / curb highlights.
          ctx.strokeStyle = 'rgba(226, 232, 240, 0.28)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(centerX - 27, centerY);
          ctx.lineTo(centerX, centerY - 13);
          ctx.lineTo(centerX + 27, centerY);
          ctx.stroke();

          // Zebra crossing on busier intersections.
          if (intersection && seed > 0.28) {
            ctx.strokeStyle = 'rgba(248, 250, 252, 0.78)';
            ctx.lineWidth = 1.6;
            for (let stripe = -2; stripe <= 2; stripe += 1) {
              ctx.beginPath();
              ctx.moveTo(centerX - 8 + stripe * 2.2, centerY - 7 + stripe * 1.1);
              ctx.lineTo(centerX + 3 + stripe * 2.2, centerY - 1 + stripe * 1.1);
              ctx.stroke();
            }
            detailsDrawn += 1;
          }

          // Dutch-style cycle priority strip on a deterministic subset of through streets.
          if (!intersection && seed > 0.61 && seed < 0.79) {
            ctx.strokeStyle = 'rgba(196, 58, 52, 0.72)';
            ctx.lineWidth = 3.1;
            ctx.beginPath();
            if (horizontal && !vertical) {
              ctx.moveTo(centerX - 20, centerY + 14);
              ctx.lineTo(centerX + 20, centerY - 4);
            } else {
              ctx.moveTo(centerX - 20, centerY - 4);
              ctx.lineTo(centerX + 20, centerY + 14);
            }
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
            ctx.lineWidth = 0.85;
            drawBike(ctx, centerX + 8, centerY + 6, 0.75);
            detailsDrawn += 2;
          }

          // Street lamps on most developed streets.
          if (seed > 0.34) {
            const side = seed > 0.67 ? 1 : -1;
            const lampX = centerX + (horizontal && !vertical ? side * 12 : side * 19);
            const lampY = centerY + (horizontal && !vertical ? side * 10 : 1);
            ctx.strokeStyle = 'rgba(51, 65, 85, 0.92)';
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.moveTo(lampX, lampY + 4);
            ctx.lineTo(lampX, lampY - 10);
            ctx.lineTo(lampX + side * 3, lampY - 11.5);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255, 238, 175, 0.96)';
            ctx.beginPath();
            ctx.arc(lampX + side * 3.3, lampY - 11.5, 1.7, 0, Math.PI * 2);
            ctx.fill();
            detailsDrawn += 1;
          }

          // Street trees create continuous green avenues.
          if (seed > 0.18 && seed < 0.46) {
            const side = hash2d(x, y, 2) > 0.5 ? 1 : -1;
            drawStreetTree(ctx, centerX + side * 24, centerY + side * 4, 7.5);
            detailsDrawn += 1;
          }

          // Parked cars on quieter streets.
          if (seed < 0.24 && (tile.traffic ?? 0) < 65) {
            ctx.save();
            ctx.translate(centerX + (vertical ? 15 : -10), centerY + (vertical ? 2 : 9));
            ctx.rotate(horizontal && !vertical ? -0.43 : 0.43);
            ctx.fillStyle = ['#64748b', '#a16207', '#475569', '#7f1d1d', '#155e75'][Math.floor(hash2d(x, y, 4) * 5) % 5];
            ctx.fillRect(-4.4, -2, 8.8, 4);
            ctx.fillStyle = 'rgba(191, 219, 254, 0.72)';
            ctx.fillRect(-1.6, -1.5, 3.2, 3);
            ctx.restore();
            detailsDrawn += 1;
          }

          // Bus stop pole + shelter glass.
          if (seed > 0.91 && !intersection) {
            const bx = centerX - 22;
            const by = centerY + 8;
            ctx.strokeStyle = 'rgba(30, 41, 59, 0.95)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bx, by + 4);
            ctx.lineTo(bx, by - 9);
            ctx.stroke();
            ctx.fillStyle = 'rgba(34, 211, 238, 0.9)';
            ctx.fillRect(bx - 2.4, by - 11, 4.8, 4.8);
            ctx.fillStyle = 'rgba(186, 230, 253, 0.24)';
            ctx.fillRect(bx + 4, by - 7, 11, 9);
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.65)';
            ctx.strokeRect(bx + 4, by - 7, 11, 9);
            detailsDrawn += 1;
          }

          // Small bicycle racks near denser streets.
          if (seed > 0.82 && seed < 0.91) {
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.88)';
            ctx.lineWidth = 0.8;
            drawBike(ctx, centerX - 15, centerY + 11, 0.78);
            drawBike(ctx, centerX - 9, centerY + 12, 0.78);
            detailsDrawn += 2;
          }
        }

        if ((type === 'park' || type === 'park_large' || type === 'community_garden' || type === 'pond_park') && seed > 0.22) {
          // Benches and picnic furniture.
          ctx.fillStyle = 'rgba(112, 78, 49, 0.94)';
          ctx.fillRect(centerX - 8, centerY + 5, 14, 2.5);
          ctx.strokeStyle = 'rgba(64, 48, 36, 0.92)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(centerX - 6, centerY + 7);
          ctx.lineTo(centerX - 6, centerY + 10);
          ctx.moveTo(centerX + 4, centerY + 7);
          ctx.lineTo(centerX + 4, centerY + 10);
          ctx.stroke();
          if (hash2d(x, y, 14) > 0.48) drawStreetTree(ctx, centerX + 14, centerY - 2, 8.5);
          detailsDrawn += 2;
        }

        // Forecourts and small public-space details around completed buildings.
        if (isDeveloped(type) && tile.building.constructionProgress >= 100) {
          if (seed > 0.58 && seed < 0.78) {
            ctx.fillStyle = 'rgba(226, 232, 240, 0.18)';
            ctx.beginPath();
            ctx.ellipse(centerX, centerY + 14, 13, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            detailsDrawn += 1;
          }

          if (zoom >= 0.9 && hash2d(x, y, 12) > 0.67) {
            // Rooftop solar panel cluster.
            ctx.save();
            ctx.translate(centerX + 1, centerY - 21);
            ctx.rotate(-0.43);
            ctx.fillStyle = 'rgba(27, 55, 83, 0.86)';
            ctx.fillRect(-6, -3, 12, 6);
            ctx.strokeStyle = 'rgba(147, 197, 253, 0.72)';
            ctx.lineWidth = 0.55;
            ctx.strokeRect(-6, -3, 12, 6);
            ctx.beginPath();
            ctx.moveTo(-2, -3);
            ctx.lineTo(-2, 3);
            ctx.moveTo(2, -3);
            ctx.lineTo(2, 3);
            ctx.stroke();
            ctx.restore();
            detailsDrawn += 1;
          }

          if (zoom >= 1.05 && hash2d(x, y, 19) > 0.78) {
            // HVAC/green-roof utility cluster for more believable rooftops.
            ctx.fillStyle = 'rgba(100, 116, 139, 0.72)';
            ctx.fillRect(centerX - 10, centerY - 16, 5, 4);
            ctx.fillStyle = 'rgba(67, 114, 75, 0.7)';
            ctx.fillRect(centerX + 6, centerY - 17, 7, 4);
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
