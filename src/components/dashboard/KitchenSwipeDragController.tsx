'use client';

import { useEffect } from 'react';

type SwipeState = {
  pointerId: number;
  card: HTMLElement;
  orderId: string;
  sourceLane: string;
  startX: number;
  startY: number;
  active: boolean;
};

function closestElement(target: EventTarget | null, selector: string) {
  return target instanceof Element ? target.closest<HTMLElement>(selector) : null;
}

function safeId(value: string) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function formId(orderId: string, targetStatus: string) {
  return `kitchen-drag-status-${safeId(orderId)}-${targetStatus}`;
}

function canMove(sourceLane?: string, targetStatus?: string) {
  if (!sourceLane || !targetStatus) return false;

  if (sourceLane === 'pending') {
    return targetStatus === 'PREPARING';
  }

  if (sourceLane === 'preparing') {
    return targetStatus === 'READY';
  }

  return false;
}

function swipeTarget(sourceLane: string, distanceX: number) {
  if (distanceX < 80) return '';

  if (sourceLane === 'pending') {
    return 'PREPARING';
  }

  if (sourceLane === 'preparing') {
    return 'READY';
  }

  return '';
}

function submitStatus(orderId?: string, targetStatus?: string) {
  if (!orderId || !targetStatus) return;

  const form = document.getElementById(formId(orderId, targetStatus));

  if (!(form instanceof HTMLFormElement) || form.dataset.submitting === '1') {
    return;
  }

  form.dataset.submitting = '1';
  form.requestSubmit ? form.requestSubmit() : form.submit();
}

function setLaneHover(lane: HTMLElement | null, active: boolean) {
  if (!lane) return;

  if (active) {
    lane.style.outline = '3px solid rgba(17, 16, 11, 0.18)';
    lane.style.outlineOffset = '3px';
    return;
  }

  lane.style.outline = '';
  lane.style.outlineOffset = '';
}

function resetSwipeCard(card?: HTMLElement | null) {
  if (!card) return;

  card.style.transform = '';
  card.style.opacity = '';
  card.style.boxShadow = '';
}

export function KitchenSwipeDragController() {
  useEffect(() => {
    let draggedCard: HTMLElement | null = null;
    let swipe: SwipeState | null = null;

    function handleDragStart(event: DragEvent) {
      const card = closestElement(
        event.target,
        '[data-kitchen-draggable-card="true"]'
      );

      if (!card || !event.dataTransfer) return;

      draggedCard = card;
      card.dataset.dragging = 'true';
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.dataset.orderId || '');
    }

    function handleDragEnd() {
      if (draggedCard) {
        draggedCard.dataset.dragging = '';
        draggedCard = null;
      }

      document
        .querySelectorAll<HTMLElement>('[data-kitchen-drop-status]')
        .forEach((lane) => setLaneHover(lane, false));
    }

    function handleDragOver(event: DragEvent) {
      const lane = closestElement(event.target, '[data-kitchen-drop-status]');
      if (!lane || !draggedCard || !event.dataTransfer) return;

      const targetStatus = lane.dataset.kitchenDropStatus;
      const sourceLane = draggedCard.dataset.currentLane;

      if (!canMove(sourceLane, targetStatus)) return;

      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setLaneHover(lane, true);
    }

    function handleDragLeave(event: DragEvent) {
      const lane = closestElement(event.target, '[data-kitchen-drop-status]');
      if (!lane) return;

      const related = event.relatedTarget;
      if (related instanceof Node && lane.contains(related)) return;

      setLaneHover(lane, false);
    }

    function handleDrop(event: DragEvent) {
      const lane = closestElement(event.target, '[data-kitchen-drop-status]');
      if (!lane || !draggedCard) return;

      const targetStatus = lane.dataset.kitchenDropStatus;
      const sourceLane = draggedCard.dataset.currentLane;
      const orderId = draggedCard.dataset.orderId;

      if (!canMove(sourceLane, targetStatus)) return;

      event.preventDefault();
      setLaneHover(lane, false);
      submitStatus(orderId, targetStatus);
    }

    function handlePointerDown(event: PointerEvent) {
      const card = closestElement(
        event.target,
        '[data-kitchen-swipe-card="true"]'
      );

      if (!card) return;

      if (
        closestElement(
          event.target,
          'button, a, input, textarea, select, summary, form'
        )
      ) {
        return;
      }

      swipe = {
        pointerId: event.pointerId,
        card,
        orderId: card.dataset.orderId || '',
        sourceLane: card.dataset.currentLane || '',
        startX: event.clientX,
        startY: event.clientY,
        active: false,
      };
    }

    function handlePointerMove(event: PointerEvent) {
      if (!swipe || swipe.pointerId !== event.pointerId) return;

      const dx = event.clientX - swipe.startX;
      const dy = event.clientY - swipe.startY;

      if (!swipe.active && Math.abs(dx) < 14) return;
      if (!swipe.active && Math.abs(dx) < Math.abs(dy) * 1.15) return;

      swipe.active = true;

      const distance = Math.max(0, Math.min(dx, 260));
      const targetStatus = swipeTarget(swipe.sourceLane, distance);

      swipe.card.style.transform = `translateX(${distance}px)`;
      swipe.card.style.opacity = targetStatus ? '0.72' : '0.92';
      swipe.card.style.boxShadow = targetStatus
        ? '0 18px 42px rgba(17, 16, 11, 0.18)'
        : '';
    }

    function handlePointerUp(event: PointerEvent) {
      if (!swipe || swipe.pointerId !== event.pointerId) return;

      const dx = event.clientX - swipe.startX;
      const targetStatus = swipeTarget(swipe.sourceLane, dx);
      const card = swipe.card;
      const orderId = swipe.orderId;

      swipe = null;
      resetSwipeCard(card);

      if (targetStatus && orderId) {
        submitStatus(orderId, targetStatus);
      }
    }

    function handlePointerCancel() {
      if (swipe?.card) {
        resetSwipeCard(swipe.card);
      }

      swipe = null;
    }

    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragend', handleDragEnd);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('dragend', handleDragEnd);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, []);

  return null;
}
