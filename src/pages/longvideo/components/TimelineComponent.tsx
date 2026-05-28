import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Timeline, TimelineState } from '@xzdarcy/react-timeline-editor';
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css';
import type { TimelineAction, TimelineRow, TimelineEffect } from '@xzdarcy/timeline-engine';
import { LongVideoSegment } from '../../../apis/longVideoSegment';
import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';

interface TimelineComponentProps {
  segments: LongVideoSegment[];
  totalDuration: number;
  onSegmentClick: (segment: LongVideoSegment) => void;
  onSegmentUpdate?: (id: string, startTime: number, endTime: number) => Promise<void>;
  selectedSegmentId?: string;
  presenterCount?: number;
  videoRef?: React.RefObject<HTMLVideoElement>;
}

const SEGMENT_COLORS: Record<string, string> = {
  presenter1: '#2196F3',
  presenter2: '#4CAF50',
  intro: '#9E9E9E',
  outro: '#9E9E9E',
  transition: '#FF9800',
  qa: '#9C27B0',
  silence: '#EEEEEE',
  unknown: '#BDBDBD',
};

const TRACK_LABELS: Record<string, string> = {
  presenter1: 'P1',
  presenter2: 'P2',
  other: 'Other',
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const TimelineComponent: React.FC<TimelineComponentProps> = ({
  segments,
  totalDuration,
  onSegmentClick,
  onSegmentUpdate,
  selectedSegmentId,
  presenterCount = 2,
  videoRef,
}) => {
  const timelineRef = useRef<TimelineState>(null);
  const [scaleWidth, setScaleWidth] = useState(160);
  const animFrameRef = useRef<number>(0);

  const segmentMap = useMemo(() => {
    const map = new Map<string, LongVideoSegment>();
    segments.forEach((seg) => { if (seg.id) map.set(seg.id, seg); });
    return map;
  }, [segments]);

  const effects = useMemo<Record<string, TimelineEffect>>(() => {
    const efx: Record<string, TimelineEffect> = {};
    Object.keys(SEGMENT_COLORS).forEach((type) => {
      efx[type] = { id: type, name: type };
    });
    return efx;
  }, []);

  const editorData = useMemo<TimelineRow[]>(() => {
    const presenter1Actions: TimelineAction[] = [];
    const presenter2Actions: TimelineAction[] = [];
    const otherActions: TimelineAction[] = [];

    segments.forEach((seg) => {
      if (!seg.id || seg.startTime == null || seg.endTime == null) return;
      const action: TimelineAction = {
        id: seg.id,
        start: seg.startTime,
        end: seg.endTime,
        effectId: seg.segmentType || 'unknown',
        selected: seg.id === selectedSegmentId,
        flexible: true,
        movable: false,
      };

      if (seg.segmentType === 'presenter1') {
        presenter1Actions.push(action);
      } else if (seg.segmentType === 'presenter2') {
        presenter2Actions.push(action);
      } else {
        otherActions.push(action);
      }
    });

    const rows: TimelineRow[] = [
      { id: 'presenter1', actions: presenter1Actions },
    ];

    if (presenterCount >= 2) {
      rows.push({ id: 'presenter2', actions: presenter2Actions });
    }

    rows.push({ id: 'other', actions: otherActions });

    return rows;
  }, [segments, selectedSegmentId, presenterCount]);

  useEffect(() => {
    const video = videoRef?.current;
    if (!video || !timelineRef.current) return;

    const syncPlayhead = () => {
      if (timelineRef.current) {
        timelineRef.current.setTime(video.currentTime);
      }
      animFrameRef.current = requestAnimationFrame(syncPlayhead);
    };

    const onPlay = () => { animFrameRef.current = requestAnimationFrame(syncPlayhead); };
    const onPause = () => { cancelAnimationFrame(animFrameRef.current); };
    const onSeeked = () => {
      if (timelineRef.current) {
        timelineRef.current.setTime(video.currentTime);
      }
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);

    if (!video.paused) {
      animFrameRef.current = requestAnimationFrame(syncPlayhead);
    }

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [videoRef]);

  const handleClickAction = useCallback((_e: React.MouseEvent<HTMLElement, MouseEvent>, param: { action: TimelineAction; row: TimelineRow }) => {
    const seg = segmentMap.get(param.action.id);
    if (seg) onSegmentClick(seg);
  }, [segmentMap, onSegmentClick]);

  const handleCursorDragEnd = useCallback((time: number) => {
    if (videoRef?.current) {
      videoRef.current.currentTime = time;
    }
  }, [videoRef]);

  const handleActionResizeEnd = useCallback((params: { action: TimelineAction; row: TimelineRow; start: number; end: number; dir: 'right' | 'left' }) => {
    const { action, start, end } = params;
    if (start < 0 || end <= start) return;
    if (onSegmentUpdate) {
      onSegmentUpdate(action.id, start, end);
    }
  }, [onSegmentUpdate]);

  const handleChange = useCallback((newData: TimelineRow[]) => {
    for (const row of newData) {
      for (const action of row.actions) {
        const seg = segmentMap.get(action.id);
        if (seg && (action.start !== seg.startTime || action.end !== seg.endTime)) {
          if (action.start >= 0 && action.end > action.start && onSegmentUpdate) {
            onSegmentUpdate(action.id, action.start, action.end);
          }
        }
      }
    }
  }, [segmentMap, onSegmentUpdate]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getActionRender = useCallback((action: TimelineAction, _row: TimelineRow) => {
    const color = SEGMENT_COLORS[action.effectId] || SEGMENT_COLORS.unknown;
    const seg = segmentMap.get(action.id);
    const isExcluded = seg && !seg.includeInOutput;
    const isSelected = action.id === selectedSegmentId;

    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: color,
          opacity: isExcluded ? 0.3 : 0.9,
          borderRadius: '3px',
          border: isSelected ? '2px solid #000' : '1px solid rgba(255,255,255,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          cursor: 'pointer',
        }}
        title={seg ? `${seg.segmentType} (${formatTime(seg.startTime!)} - ${formatTime(seg.endTime!)})` : ''}
      >
        <span style={{ fontSize: '10px', color: '#fff', textShadow: '0 0 2px rgba(0,0,0,0.7)', whiteSpace: 'nowrap' }}>
          {action.effectId}
        </span>
      </div>
    );
  }, [segmentMap, selectedSegmentId]);

  const getScaleRender = useCallback((scale: number) => {
    return <span style={{ fontSize: '10px', color: '#666' }}>{formatTime(scale)}</span>;
  }, []);

  if (totalDuration === 0 || segments.length === 0) return null;

  const visibleColors = Object.entries(SEGMENT_COLORS).filter(
    ([type]) => !(type === 'presenter2' && presenterCount < 2)
  );

  const scaleCount = Math.ceil(totalDuration) + 1;

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', marginBottom: '8px', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        {visibleColors.map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: 12, height: 12, backgroundColor: color, borderRadius: 2 }} />
            <span style={{ fontSize: '12px' }}>{type}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="zoom-out" variant="icon" onClick={() => setScaleWidth((prev) => Math.max(40, prev - 40))} />
            <span style={{ fontSize: '12px', minWidth: '60px', textAlign: 'center' }}>{scaleWidth}px/s</span>
            <Button iconName="zoom-in" variant="icon" onClick={() => setScaleWidth((prev) => Math.min(500, prev + 40))} />
          </SpaceBetween>
        </div>
      </div>

      <div style={{ display: 'flex', border: '1px solid #d5dbdb', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: '50px', flexShrink: 0, borderRight: '1px solid #d5dbdb', backgroundColor: '#fafafa' }}>
          {editorData.map((row) => {
            return (
              <div
                key={row.id}
                style={{
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: SEGMENT_COLORS[row.id] || '#666',
                  borderBottom: '1px solid #eee',
                }}
              >
                {TRACK_LABELS[row.id] || row.id}
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1, height: `${editorData.length * 32 + 32}px`, minHeight: '96px' }}>
          <Timeline
            ref={timelineRef}
            editorData={editorData}
            effects={effects}
            scale={1}
            scaleWidth={scaleWidth}
            scaleSplitCount={10}
            startLeft={10}
            minScaleCount={scaleCount}
            maxScaleCount={scaleCount}
            rowHeight={32}
            autoScroll={true}
            gridSnap={false}
            dragLine={true}
            hideCursor={false}
            disableDrag={false}
            getActionRender={getActionRender}
            getScaleRender={getScaleRender}
            onClickAction={handleClickAction}
            onCursorDragEnd={handleCursorDragEnd}
            onActionResizeEnd={handleActionResizeEnd}
            onChange={handleChange}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      </div>
    </div>
  );
};

export default TimelineComponent;
