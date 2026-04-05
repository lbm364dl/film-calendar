'use client';

interface HelpModalProps {
  title: string;
  body: string;
  closing: boolean;
  onClose: () => void;
}

export default function HelpModal({ title, body, closing, onClose }: HelpModalProps) {
  return (
    <div className={`help-modal-overlay${closing ? ' closing' : ''}`} onClick={onClose}>
      <div className="help-modal" onClick={e => e.stopPropagation()}>
        <button type="button" className="help-modal-close" onClick={onClose}>&times;</button>
        <p dangerouslySetInnerHTML={{ __html: title }} />
        <p>{body}</p>
      </div>
    </div>
  );
}
