import React, { useState } from 'react';
import { Table, Header, Select, Toggle, Button, Input, SpaceBetween, Box } from '@cloudscape-design/components';
import { LongVideoSegment, updateSegment } from '../../../apis/longVideoSegment';

interface SegmentListComponentProps {
  segments: LongVideoSegment[];
  onSegmentsChange: (segments: LongVideoSegment[]) => void;
  onSegmentSelect: (segment: LongVideoSegment) => void;
  selectedSegmentId?: string;
  presenterCount?: number;
  onSegmentEdited?: () => void;
}

const getSegmentTypeOptions = (presenterCount: number) => {
  const options = [
    { label: 'Presenter 1', value: 'presenter1' },
  ];
  if (presenterCount >= 2) {
    options.push({ label: 'Presenter 2', value: 'presenter2' });
  }
  options.push(
    { label: 'Intro', value: 'intro' },
    { label: 'Outro', value: 'outro' },
    { label: 'Transition', value: 'transition' },
    { label: 'Q&A', value: 'qa' },
    { label: 'Silence', value: 'silence' },
  );
  return options;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseTime(mmss: string): number | null {
  const match = mmss.trim().match(/^(\d+):([0-5]\d)$/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

const SegmentListComponent: React.FC<SegmentListComponentProps> = ({
  segments,
  onSegmentsChange,
  onSegmentSelect,
  selectedSegmentId,
  presenterCount = 2,
  onSegmentEdited,
}) => {
  const segmentTypeOptions = getSegmentTypeOptions(presenterCount);
  const [editingTimes, setEditingTimes] = useState<Record<string, { start: string; end: string }>>({});

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

  const handleTimeBlur = async (segment: LongVideoSegment, field: 'start' | 'end', rawValue: string) => {
    const parsed = parseTime(rawValue);
    if (parsed === null) {
      setEditingTimes(prev => {
        const copy = { ...prev };
        delete copy[segment.id];
        return copy;
      });
      return;
    }

    const newStart = field === 'start' ? parsed : segment.startTime!;
    const newEnd = field === 'end' ? parsed : segment.endTime!;

    if (newStart >= newEnd) {
      setEditingTimes(prev => {
        const copy = { ...prev };
        delete copy[segment.id];
        return copy;
      });
      return;
    }

    await updateSegment(segment.id, { startTime: newStart, endTime: newEnd });
    const updated = segments.map(s =>
      s.id === segment.id ? { ...s, startTime: newStart, endTime: newEnd } : s
    );
    onSegmentsChange(updated);
    onSegmentEdited?.();
    setEditingTimes(prev => {
      const copy = { ...prev };
      delete copy[segment.id];
      return copy;
    });
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
          cell: item => {
            const local = editingTimes[item.id];
            const startVal = local?.start ?? formatTime(item.startTime!);
            const endVal = local?.end ?? formatTime(item.endTime!);
            return (
              <SpaceBetween size="xxs" direction="horizontal">
                <Input
                  value={startVal}
                  onChange={({ detail }) =>
                    setEditingTimes(prev => ({
                      ...prev,
                      [item.id]: { start: detail.value, end: prev[item.id]?.end ?? formatTime(item.endTime!) }
                    }))
                  }
                  onBlur={() => handleTimeBlur(item, 'start', startVal)}
                  ariaLabel="Start time"
                />
                <Box>–</Box>
                <Input
                  value={endVal}
                  onChange={({ detail }) =>
                    setEditingTimes(prev => ({
                      ...prev,
                      [item.id]: { start: prev[item.id]?.start ?? formatTime(item.startTime!), end: detail.value }
                    }))
                  }
                  onBlur={() => handleTimeBlur(item, 'end', endVal)}
                  ariaLabel="End time"
                />
              </SpaceBetween>
            );
          },
          width: 180,
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
              selectedOption={segmentTypeOptions.find(o => o.value === item.segmentType) || { label: item.segmentType, value: item.segmentType }}
              onChange={({ detail }) => handleTypeChange(item, detail.selectedOption.value!)}
              options={segmentTypeOptions}
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
          header: "Preview",
          cell: item => (
            <Button
              variant={item.id === selectedSegmentId ? "primary" : "normal"}
              onClick={() => onSegmentSelect(item)}
              iconName="caret-right-filled"
              ariaLabel="Preview segment"
            />
          ),
          width: 70,
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
