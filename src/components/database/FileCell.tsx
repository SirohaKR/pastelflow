import { useRef, useState, type DragEvent } from 'react';
import { api, type FileItem, type PropValue } from '../../api';

export const isImage = (f: FileItem) => (f.mime ? f.mime.startsWith('image/') : /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(f.url));
export const asFiles = (v: PropValue | undefined): FileItem[] => (Array.isArray(v) ? v : []);

function sizeLabel(n?: number) {
  if (!n) return '';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

const fileIcon = (f: FileItem) => {
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  if (['pdf'].includes(ext)) return '📕';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['ppt', 'pptx', 'key'].includes(ext)) return '📽️';
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return '🎵';
  if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) return '🎬';
  return '📄';
};

// 읽기 전용 미리보기 (표 칸·칸반 카드)
export function FilePreview({ files, max = 3 }: { files: FileItem[]; max?: number }) {
  if (!files.length) return null;
  return (
    <span className="file-preview">
      {files.slice(0, max).map((f) => (
        isImage(f)
          ? <img key={f.url} className="file-thumb" src={f.url} alt={f.name} title={f.name} loading="lazy" />
          : <span key={f.url} className="file-chip" title={f.name}>{fileIcon(f)} {f.name}</span>
      ))}
      {files.length > max && <span className="file-more">+{files.length - max}</span>}
    </span>
  );
}

type Props = {
  value: PropValue | undefined;
  onChange: (v: PropValue | null) => void;
  // 항목 패널처럼 넓은 곳에서는 크게 보여 준다
  large?: boolean;
  readOnly?: boolean;
};

// 고칠 수 있는 파일 칸: 눌러서 올리기, 끌어 놓기, 열기, 지우기
export function FileCell({ value, onChange, large = false, readOnly = false }: Props) {
  const files = asFiles(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');

  const upload = async (list: FileList | File[]) => {
    const picked = [...list].slice(0, 20 - files.length);
    if (!picked.length) return;
    setError('');
    setBusy(picked.length);
    const added: FileItem[] = [];
    for (const f of picked) {
      try {
        const r = await api.upload(f);
        added.push({ url: r.url, name: r.name || f.name, mime: r.mime || f.type, size: r.size || f.size });
      } catch (e) {
        setError((e as Error).message);
      }
      setBusy((n) => n - 1);
    }
    if (added.length) onChange([...files, ...added]);
  };

  const remove = (url: string) => {
    const next = files.filter((f) => f.url !== url);
    onChange(next.length ? next : null);
  };

  const dropProps = readOnly ? {} : {
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(false);
      upload(e.dataTransfer.files);
    },
  };

  return (
    <div className={`file-cell ${large ? 'large' : ''} ${over ? 'drop-over' : ''}`} {...dropProps}>
      {files.map((f) => (
        <span key={f.url} className={`file-item ${isImage(f) ? 'img' : ''}`}>
          <a href={f.url} target="_blank" rel="noopener noreferrer" title={`${f.name}${f.size ? ` · ${sizeLabel(f.size)}` : ''}`}>
            {isImage(f)
              ? <img src={f.url} alt={f.name} loading="lazy" />
              : <span className="file-chip">{fileIcon(f)} {f.name}{large && f.size ? <small> {sizeLabel(f.size)}</small> : null}</span>}
          </a>
          {!readOnly && (
            <button className="file-x" title="지우기" onClick={(e) => { e.stopPropagation(); remove(f.url); }}>✕</button>
          )}
        </span>
      ))}
      {busy > 0 && <span className="file-busy">올리는 중… {busy}</span>}
      {!readOnly && files.length < 20 && (
        <button className="file-add" title="파일 올리기 (여기로 끌어 놓아도 돼요)" onClick={() => inputRef.current?.click()}>
          {files.length ? '＋' : large ? '＋ 파일·이미지 올리기 (끌어 놓아도 돼요)' : '＋ 파일'}
        </button>
      )}
      {readOnly && !files.length && <span className="cell-empty">비어 있음</span>}
      {error && <span className="file-error" title={error}>⚠</span>}
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) upload(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
