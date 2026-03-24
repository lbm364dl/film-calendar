'use client';

import { useState, useCallback, useEffect } from 'react';
import type { SessionModalData } from '@/lib/types';

export function useSessionModal() {
  const [modal, setModal] = useState<SessionModalData | null>(null);
  const [modalClosing, setModalClosing] = useState(false);

  const openModal = useCallback((data: SessionModalData) => {
    setModalClosing(false);
    setModal(data);
  }, []);

  const closeModal = useCallback(() => {
    if (!modal) return;
    setModalClosing(true);
    setTimeout(() => { setModal(null); setModalClosing(false); }, 220);
  }, [modal]);

  return { modal, modalClosing, openModal, closeModal };
}

export function useLbModal() {
  const [showLbModal, setShowLbModal] = useState(false);
  const [lbModalClosing, setLbModalClosing] = useState(false);

  const openLbModal = useCallback(() => setShowLbModal(true), []);

  const closeLbModal = useCallback(() => {
    setLbModalClosing(true);
    setTimeout(() => { setShowLbModal(false); setLbModalClosing(false); }, 220);
  }, []);

  return { showLbModal, lbModalClosing, openLbModal, closeLbModal };
}

export function useEscapeKey(handlers: (() => void)[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        for (const fn of handlers) {
          fn();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handlers]);
}
