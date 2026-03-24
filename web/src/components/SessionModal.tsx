'use client';

import { t } from '@/lib/translations';
import type { SessionModalData } from '@/lib/types';
import type { LangKey } from '@/lib/translations';

interface SessionModalProps {
  modal: SessionModalData;
  modalClosing: boolean;
  lang: LangKey;
  onClose: () => void;
}

export default function SessionModal({ modal, modalClosing, lang, onClose }: SessionModalProps) {
  return (
    <div
      className={`session-modal show ${modalClosing ? 'closing' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="session-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="session-modal-header">
          <div className="session-modal-header-text">
            <div className="session-modal-title">{modal.titleLabel}</div>
            <div className="session-modal-time">{modal.timeLabel}</div>
          </div>
          <button className="session-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="session-modal-actions">
          {modal.hasDirectUrl ? (
            <>
              <a href={modal.ticketUrl} className="session-modal-action" target="_blank" rel="noopener noreferrer">{t(lang, 'buyTickets')}</a>
              <a href={modal.filmPageUrl} className="session-modal-action" target="_blank" rel="noopener noreferrer">{t(lang, 'viewFilmPage')}</a>
              <a href={modal.calendarUrl} className="session-modal-action" target="_blank" rel="noopener noreferrer">{t(lang, 'addToCalendar')}</a>
            </>
          ) : (
            <>
              <a href={modal.filmPageUrl} className="session-modal-action" target="_blank" rel="noopener noreferrer">{t(lang, 'buyTickets')}</a>
              <a href={modal.calendarUrl} className="session-modal-action" target="_blank" rel="noopener noreferrer">{t(lang, 'addToCalendar')}</a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
