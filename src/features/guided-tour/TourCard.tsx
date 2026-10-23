import type { RefObject } from 'react';
import { Button } from '../../components/ui';
import { ArrowRight, Check, ChevronLeft } from '../../components/icons';
import type { TourStep } from './tourSteps';
import type { Rect } from './tourGeometry';

export function TourCard({
  step,
  index,
  count,
  position,
  cardRef,
  contentRef,
  missing,
  ready,
  onMove,
  onDismiss,
}: {
  step: TourStep;
  index: number;
  count: number;
  position: Rect;
  cardRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  missing: boolean;
  ready: boolean;
  onMove: (direction: number) => void;
  onDismiss: (finished?: boolean) => void;
}) {
  const Icon = step.icon;
  return (
    <div
      ref={cardRef}
      className="tour-card"
      data-ready={ready}
      style={{ left: position.x, top: position.y }}
    >
      <header className="tour-card-header">
        <span>Guided tour</span>
        <span>
          {index + 1} of {count}
        </span>
      </header>
      <div
        className="tour-progress"
        role="progressbar"
        aria-label="Guided tour progress"
        aria-valuemin={0}
        aria-valuemax={count}
        aria-valuenow={index + 1}
      >
        <span style={{ width: `${((index + 1) / count) * 100}%` }} />
      </div>
      <div ref={contentRef} className="tour-card-content">
        <div className="tour-title-row">
          <span className="tour-icon">
            <Icon size={24} />
          </span>
          <h2 id="guided-tour-title" tabIndex={-1}>
            {step.title}
          </h2>
        </div>
        <p id="guided-tour-description">{step.description}</p>
        {step.tips && (
          <ul className="tour-tips">
            {step.tips.map((tip) => (
              <li key={tip}>
                <Check size={16} />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        )}
        {missing && (
          <p className="tour-target-notice">
            This feature’s usual location isn’t visible right now. You can continue exploring.
          </p>
        )}
      </div>
      <footer className="tour-card-footer">
        <Button variant="ghost" onClick={() => onDismiss()}>
          Skip tour
        </Button>
        <div className="tour-card-actions">
          <Button
            variant="ghost"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Back to previous tour step"
          >
            <ChevronLeft size={16} />
            Back
          </Button>
          <Button
            variant="primary"
            onClick={() => (index === count - 1 ? onDismiss(true) : onMove(1))}
          >
            {index === count - 1 ? 'Finish tour' : 'Next'}
            <ArrowRight size={16} />
          </Button>
        </div>
      </footer>
    </div>
  );
}
