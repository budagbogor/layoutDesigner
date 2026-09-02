import React from 'react';
import { ValidationReport, ValidationIssue } from '@/domain/validation/types';

interface ValidationPanelProps {
  report: ValidationReport;
  onSelectObject: (objectId: string) => void;
}

export const ValidationPanel: React.FC<ValidationPanelProps> = ({
  report,
  onSelectObject,
}) => {
  const { valid, hardCount, warningCount, infoCount, issues } = report;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Validation Summary Header */}
      <div
        style={{
          padding: '10px',
          borderRadius: '6px',
          background: valid ? 'rgba(35, 134, 54, 0.15)' : 'rgba(248, 81, 73, 0.15)',
          border: valid ? '1px solid rgba(35, 134, 54, 0.4)' : '1px solid rgba(248, 81, 73, 0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>{valid ? '✓' : '⚠'}</span>
          <div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 'bold',
                color: valid ? 'var(--accent-green)' : 'var(--accent-red)',
              }}
            >
              {valid ? 'Layout Compliant' : `${hardCount} Hard Violation${hardCount > 1 ? 's' : ''}`}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {valid
                ? 'All objects remain within certified building boundary.'
                : 'Hard violations disqualify layout from approval.'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
          <span style={{ color: hardCount > 0 ? 'var(--accent-red)' : 'var(--text-muted)' }}>
            HARD: {hardCount}
          </span>
          <span style={{ color: warningCount > 0 ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
            WARN: {warningCount}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            INFO: {infoCount}
          </span>
        </div>
      </div>

      {/* Issues List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Issues Report ({issues.length})
        </div>

        {issues.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', background: 'var(--bg-secondary)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
            No rule violations detected.
          </div>
        ) : (
          issues.map((issue: ValidationIssue) => {
            const isHard = issue.severity === 'HARD';
            const isWarning = issue.severity === 'WARNING';

            const badgeColor = isHard ? '#f85149' : isWarning ? '#d29922' : '#58a6ff';
            const badgeBg = isHard
              ? 'rgba(248, 81, 73, 0.15)'
              : isWarning
              ? 'rgba(210, 153, 34, 0.15)'
              : 'rgba(88, 166, 255, 0.15)';

            return (
              <div
                key={issue.id}
                onClick={() => onSelectObject(issue.objectId)}
                title="Click to select affected object on canvas"
                style={{
                  padding: '8px 10px',
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${isHard ? 'rgba(248, 81, 73, 0.4)' : 'var(--border-color)'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {/* Header: Rule ID & Severity Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    {issue.ruleId}
                  </span>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 'bold',
                      color: badgeColor,
                      background: badgeBg,
                      padding: '1px 5px',
                      borderRadius: '3px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {issue.severity}
                  </span>
                </div>

                {/* Affected Object & Difference */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--accent-cyan)' }}>
                    Object: <strong>{issue.objectId}</strong>
                  </span>
                  {issue.difference !== undefined && (
                    <span style={{ color: 'var(--accent-red)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                      +{issue.difference.toFixed(3)}m overflow
                    </span>
                  )}
                </div>

                {/* Message */}
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  {issue.message}
                </div>

                {/* Suggested Action */}
                {issue.suggestedAction && (
                  <div style={{ marginTop: '6px', fontSize: '10px', color: 'var(--text-muted)', borderTop: '1px dashed var(--border-color)', paddingTop: '4px' }}>
                    💡 {issue.suggestedAction}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
