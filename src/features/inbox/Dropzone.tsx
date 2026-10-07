import { useRef, useState, type DragEvent } from 'react';
import { ImagePlus, ArrowUpFromLine } from 'lucide-react';
import { Button } from '../../components/ui';
export function Dropzone({
  onFile,
  disabled,
  onError,
}: {
  onFile: (file: File) => void;
  disabled: boolean;
  onError: (s: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  function drop(e: DragEvent) {
    e.preventDefault();
    depth.current = 0;
    setDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files.length !== 1) {
      onError('Please add one screenshot at a time.');
      return;
    }
    onFile(e.dataTransfer.files[0]);
  }
  return (
    <div
      className={`dropzone ${dragging ? 'dragging' : ''}`}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        setDragging(true);
      }}
      onDragLeave={() => {
        depth.current--;
        if (depth.current === 0) setDragging(false);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
      }}
      onDrop={drop}
      aria-busy={disabled}
    >
      <div className="drop-illustration">
        <span className="image-tile">
          <ImagePlus size={32} />
        </span>
        <span className="upload-dot">
          <ArrowUpFromLine size={17} />
        </span>
      </div>
      <h2>{dragging ? 'Make room for clarity.' : 'Drop a screenshot here'}</h2>
      <p>Paste from clipboard or click to browse</p>
      <Button onClick={() => input.current?.click()} disabled={disabled}>
        <ImagePlus size={16} />
        Browse files
      </Button>
      <span className="file-hint">
        PNG, JPG, JPEG, WEBP <span>·</span> Up to 10 MB
      </span>
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Upload screenshot"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
