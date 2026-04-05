'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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

export function useMoreFiltersModal() {
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [moreFiltersClosing, setMoreFiltersClosing] = useState(false);

  const scrollYRef = useRef(0);

  const openMoreFilters = useCallback(() => {
    setShowMoreFilters(true);
    scrollYRef.current = window.scrollY;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollYRef.current}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
  }, []);

  const closeMoreFilters = useCallback(() => {
    setMoreFiltersClosing(true);
    setTimeout(() => {
      setShowMoreFilters(false);
      setMoreFiltersClosing(false);
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      window.scrollTo(0, scrollYRef.current);
    }, 220);
  }, []);

  return { showMoreFilters, moreFiltersClosing, openMoreFilters, closeMoreFilters };
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
