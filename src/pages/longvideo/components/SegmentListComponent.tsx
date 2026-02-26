import React from 'react';
import { Table, Header, Select, Toggle, Button } from '@cloudscape-design/components';
import { LongVideoSegment, updateSegment } from '../../../apis/longVideoSegment';

interface SegmentListComponentProps {
  segments: LongVideoSegment[];
  onSegmentsChange: (segments: LongVideoSegment[]) => void;
  onSegmentSelect: (segment: LongVideoSegment) => void;
  selectedSegmentId?: string;
}

const SEGMENT_TYPE_OPTIONS = [
  { label: 'Presenter 1', value: 'presenter1' },
  { label: 'Presenter 2', value: 'presenter2' },
  { label: 'Intro', value: 'intro' },
  { label: 'Outro', value: 'outro' },
  { label: 'Transition', value: 'transition' },
  { label: 'Q&A', value: 'qa' },
  { label: 'Silence', value: 'silence' },
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const SegmentListComponent: React.FC<SegmentListComponentProps> = ({
  segments,
  onSegmentsChange,
  onSegmentSelect,
  selectedSegmentId,
}) => {

  const handleTypeChange = async (segment: LongVideoSegment, newType: string) => {
    const speakerLabel = newType.startsWith('presenter') ? newType : segment.speakerLabel;
    await updateSegment(segment.id, {
      segmentType: newType,
      speakerLabel: speakerLabel ?? undefined,
    });
    const updated = segments.map(s =>
      s.id === segment.id ? { ...s, segmentType: newType, speakerLabel: speakerLabel ?? s.speakerLabel } : s
    );
    onSegmentsChange(updated);
  };

  const handleIncludeToggle = async (segment: LongVideoSegment) => {
    const newValue = !segment.includeInOutput;
    await updateSegment(segment.id, { includeInOutput: newValue });
    const updated = segments.map(s =>
      s.id === segment.id ? { ...s, includeInOutput: newValue } : s
    );
    onSegmentsChange(updated);
  };

  return (
    <Table
      columnDefinitions={[
        {
          id: "index",
          header: "#",
          cell: (item) => segments.indexOf(item) + 1,
          width: 50,
        },
        {
          id: "time",
          header: "Time",
          cell: item => `${formatTime(item.startTime!)} - ${formatTime(item.endTime!)}`,
          width: 150,
        },
        {
          id: "duration",
          header: "Duration",
          cell: item => `${((item.endTime! - item.startTime!)).toFixed(1)}s`,
          width: 80,
        },
        {
          id: "type",
          header: "Type",
          cell: item => (
            <Select
              selectedOption={SEGMENT_TYPE_OPTIONS.find(o => o.value === item.segmentType) || { label: item.segmentType, value: item.segmentType }}
              onChange={({ detail }) => handleTypeChange(item, detail.selectedOption.value!)}
              options={SEGMENT_TYPE_OPTIONS}
              expandToViewport
            />
          ),
          width: 180,
        },
        {
          id: "confidence",
          header: "AI Confidence",
          cell: item => item.aiConfidence != null ? `${(item.aiConfidence * 100).toFixed(0)}%` : '-',
          width: 100,
        },
        {
          id: "include",
          header: "Include",
          cell: item => (
            <Toggle
              checked={item.includeInOutput ?? true}
              onChange={() => handleIncludeToggle(item)}
            />
          ),
          width: 80,
        },
        {
          id: "select",
          header: "",
          cell: item => (
            <Button
              variant={item.id === selectedSegmentId ? "primary" : "normal"}
              onClick={() => onSegmentSelect(item)}
              iconName="angle-right"
            />
          ),
          width: 60,
        },
      ]}
      items={segments}
      header={
        <Header counter={`(${segments.length})`}>
          Segments
        </Header>
      }
      stickyHeader
      stripedRows
    />
  );
};

export default SegmentListComponent;
