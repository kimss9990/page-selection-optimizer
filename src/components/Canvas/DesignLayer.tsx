import { useState, useCallback } from 'react';
import type { Design, Placement, BoundingBox } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { polygonsToSVGPath } from '../../lib/svgParser';
import { rotatePolygon, translatePolygon, getPolygonsBoundingBox } from '../../lib/geometryUtils';
import { doPolygonsCollide, isPolygonInsideBounds } from '../../lib/collisionDetection';
import type { Point, Polygon } from '../../types';

interface DesignLayerProps {
  design: Design;
  placements: Placement[];
  scale: number;
  isManualMode: boolean;
  paperBounds: BoundingBox;
  margin: number;
}

export function DesignLayer({ design, placements, scale, isManualMode, paperBounds, margin }: DesignLayerProps) {
  const updateManualPlacement = useAppStore(state => state.updateManualPlacement);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);

  // 폴리곤 변환 함수
  const getTransformedPolygons = useCallback((placement: Placement): Polygon[] => {
    const center: Point = {
      x: design.boundingBox.width / 2,
      y: design.boundingBox.height / 2,
    };
    return design.polygons.map(poly => {
      let transformed = rotatePolygon(poly, placement.rotation, center);
      transformed = translatePolygon(transformed, placement.x, placement.y);
      return transformed;
    });
  }, [design]);

  // 배치 유효성 검사
  const isValidPlacement = useCallback((
    newPlacement: Placement,
    placementIndex: number
  ): boolean => {
    const newPolygons = getTransformedPolygons(newPlacement);
    const edgeMargin = 2; // 종이 바깥쪽 여백 2mm 고정

    // 종이 경계 내 확인 (바깥쪽 여백 2mm)
    for (const poly of newPolygons) {
      if (!isPolygonInsideBounds(poly, paperBounds, edgeMargin)) {
        return false;
      }
    }

    // 다른 배치와 충돌 확인 (실제 겹침만, margin 0)
    for (let i = 0; i < placements.length; i++) {
      if (i === placementIndex) continue;
      const otherPolygons = getTransformedPolygons(placements[i]);
      for (const poly of newPolygons) {
        for (const otherPoly of otherPolygons) {
          if (doPolygonsCollide(poly, otherPoly, 0)) {
            return false;
          }
        }
      }
    }

    return true;
  }, [getTransformedPolygons, placements, paperBounds]);

  const handleMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    if (!isManualMode) return;
    e.preventDefault();
    setDraggingIndex(index);
    setDragStart({ x: e.clientX, y: e.clientY });
  }, [isManualMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggingIndex === null || !dragStart || !isManualMode) return;

    const dx = (e.clientX - dragStart.x) / scale;
    const dy = (e.clientY - dragStart.y) / scale;

    const placement = placements[draggingIndex];
    const newPlacement: Placement = {
      ...placement,
      x: placement.x + dx,
      y: placement.y + dy,
    };

    // SAT 충돌 검사로 유효한 위치인지 확인
    if (isValidPlacement(newPlacement, draggingIndex)) {
      updateManualPlacement(draggingIndex, {
        x: newPlacement.x,
        y: newPlacement.y,
      });
      setDragStart({ x: e.clientX, y: e.clientY });
    }
    // 유효하지 않은 위치면 이동하지 않음 (도면이 현재 위치에 유지됨)
  }, [draggingIndex, dragStart, scale, placements, updateManualPlacement, isManualMode, isValidPlacement]);

  const handleMouseUp = useCallback(() => {
    setDraggingIndex(null);
    setDragStart(null);
  }, []);

  const handleRotate = useCallback((index: number) => {
    if (!isManualMode) return;
    const placement = placements[index];
    const nextRotation = ((placement.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    const newPlacement: Placement = { ...placement, rotation: nextRotation };

    // 회전 후에도 유효한 위치인지 확인
    if (isValidPlacement(newPlacement, index)) {
      updateManualPlacement(index, { rotation: nextRotation });
    }
  }, [placements, updateManualPlacement, isManualMode, isValidPlacement]);

  // 배치별 변환된 폴리곤 및 SVG path 생성
  const renderPlacements = placements.map((placement, index) => {
    const center: Point = {
      x: design.boundingBox.width / 2,
      y: design.boundingBox.height / 2,
    };

    // 폴리곤 변환 (회전 후 이동)
    const transformedPolygons: Polygon[] = design.polygons.map(poly => {
      let transformed = rotatePolygon(poly, placement.rotation, center);
      transformed = translatePolygon(transformed, placement.x, placement.y);
      return transformed;
    });

    const bbox = getPolygonsBoundingBox(transformedPolygons);
    const pathData = polygonsToSVGPath(transformedPolygons);

    // 색상 (드래그 중이면 강조)
    const isDragging = draggingIndex === index;
    const fillColor = isDragging ? '#60A5FA' : '#93C5FD';
    const strokeColor = isDragging ? '#2563EB' : '#3B82F6';

    return (
      <g
        key={index}
        onMouseDown={(e) => handleMouseDown(e, index)}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isManualMode ? 'move' : 'default' }}
      >
        {/* 도면 폴리곤 */}
        <path
          d={pathData}
          fill={fillColor}
          fillOpacity={0.5}
          stroke={strokeColor}
          strokeWidth={1 / scale}
          transform={`scale(${scale})`}
        />

        {/* 바운딩 박스 (수동 모드에서만) */}
        {isManualMode && (
          <rect
            x={bbox.x * scale}
            y={bbox.y * scale}
            width={bbox.width * scale}
            height={bbox.height * scale}
            fill="none"
            stroke="#9CA3AF"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
        )}

        {/* 회전 버튼 (수동 모드에서만) */}
        {isManualMode && (
          <g
            transform={`translate(${(bbox.x + bbox.width) * scale - 12}, ${bbox.y * scale - 12})`}
            onClick={(e) => {
              e.stopPropagation();
              handleRotate(index);
            }}
            style={{ cursor: 'pointer' }}
          >
            <circle
              r="10"
              cx="10"
              cy="10"
              fill="white"
              stroke="#6B7280"
              strokeWidth="1"
            />
            <path
              d="M10 6 L10 10 L14 10"
              fill="none"
              stroke="#6B7280"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M7 7 A 4 4 0 1 1 6 11"
              fill="none"
              stroke="#6B7280"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </g>
        )}

        {/* 배치 번호 */}
        <text
          x={(bbox.x + bbox.width / 2) * scale}
          y={(bbox.y + bbox.height / 2) * scale}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-xs font-bold fill-blue-800"
          style={{ fontSize: Math.max(12, 14 / scale) }}
        >
          {index + 1}
        </text>

        {/* 회전 각도 표시 */}
        {placement.rotation !== 0 && (
          <text
            x={(bbox.x + bbox.width / 2) * scale}
            y={(bbox.y + bbox.height / 2 + 15) * scale}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-xs fill-gray-500"
            style={{ fontSize: Math.max(10, 10 / scale) }}
          >
            {placement.rotation}°
          </text>
        )}
      </g>
    );
  });

  return <>{renderPlacements}</>;
}
