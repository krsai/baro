const WORKSPACE_DATA_CHANGED_EVENT = 'baro:workspace-data-changed';

export const WORKSPACE_DATA_TOPICS = Object.freeze({
  STYLES: 'styles',
  ASSIGNMENT_BOARD: 'assignment-board',
});

const toPositiveIntOrNull = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

const normalizeStringList = (value) => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
};

const normalizeTopics = (value) => normalizeStringList(
  Array.isArray(value) ? value : [value]
);

export const hasWorkspaceDataTopic = (detail, topic) =>
  Array.isArray(detail?.topics) && detail.topics.includes(String(topic || '').trim());

export const emitWorkspaceDataChanged = ({
  topics = [],
  orgId = null,
  styleIds = [],
  assignmentIds = [],
  source = '',
} = {}) => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }

  const normalizedTopics = normalizeTopics(topics);
  if (normalizedTopics.length === 0) return;

  window.dispatchEvent(
    new CustomEvent(WORKSPACE_DATA_CHANGED_EVENT, {
      detail: {
        topics: normalizedTopics,
        orgId: toPositiveIntOrNull(orgId),
        styleIds: normalizeStringList(styleIds),
        assignmentIds: normalizeStringList(assignmentIds),
        source: String(source || '').trim(),
        at: Date.now(),
      },
    })
  );
};

export const subscribeWorkspaceDataChanged = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') {
    return () => {};
  }

  const handleEvent = (event) => {
    listener(event?.detail || null);
  };

  window.addEventListener(WORKSPACE_DATA_CHANGED_EVENT, handleEvent);
  return () => {
    window.removeEventListener(WORKSPACE_DATA_CHANGED_EVENT, handleEvent);
  };
};
