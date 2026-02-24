import React from 'react';
import { LongVideoSegment } from '../../../apis/longVideoSegment';

interface TimelineComponentProps {
  segments: LongVideoSegment[];
  totalDuration: number;
  onSegmentClick: (segment: LongVideoSegment) => void;
  selectedSegmentId?: string;
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

const TimelineComponent: React.FC<TimelineComponentProps> = ({
  segments,
  totalDuration,
  onSegmentClick,
  selectedSegmentId,
}) => {
  if (totalDuration === 0) return null;

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', marginBottom: '8px', gap: '12px', flexWrap: 'wrap' }}>
        {Object.entries(SEGMENT_COLORS).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: 12, height: 12, backgroundColor: color, borderRadius: 2 }} />
            <span style={{ fontSize: '12px' }}>{type}</span>
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '40px',
          borderRadius: '4px',
          overflow: 'hidden',
          border: '1px solid #ccc',
        }}
      >
        {segments.map((segment) => {
          const width = ((segment.endTime! - segment.startTime!) / totalDuration) * 100;
          const color = SEGMENT_COLORS[segment.segmentType] || SEGMENT_COLORS.unknown;
          const isSelected = segment.id === selectedSegmentId;
          const isExcluded = !segment.includeInOutput;

          return (
            <div
              key={segment.id}
              onClick={() => onSegmentClick(segment)}
              title={`${segment.segmentType} (${formatTime(segment.startTime!)} - ${formatTime(segment.endTime!)})`}
              style={{
                width: `${width}%`,
                minWidth: '2px',
                height: '100%',
                backgroundColor: color,
                opacity: isExcluded ? 0.3 : 1,
                cursor: 'pointer',
                borderRight: '1px solid rgba(255,255,255,0.3)',
                outline: isSelected ? '2px solid #000' : 'none',
                outlineOffset: '-2px',
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666', marginTop: '4px' }}>
        <span>0:00</span>
        <span>{formatTime(totalDuration)}</span>
      </div>
    </div>
  );
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default TimelineComponent;
