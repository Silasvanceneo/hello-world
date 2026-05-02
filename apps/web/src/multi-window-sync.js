export function getStateRevision(state) {
  return collectLatestTimestamp(state) ?? 0;
}

export function shouldAcceptIncomingState(currentState, incomingState) {
  const incomingRevision = getStateRevision(incomingState);
  const currentRevision = getStateRevision(currentState);
  if (incomingRevision !== currentRevision) {
    return incomingRevision > currentRevision;
  }
  return stableStateString(incomingState) > stableStateString(currentState);
}

export function bindMultiWindowSync({
  storageKey,
  environment = globalThis,
  getState,
  setState,
  parseState,
  render,
  onStatus,
}) {
  if (!environment?.addEventListener) {
    return () => undefined;
  }

  const listener = (event) => {
    if (event.key !== storageKey || typeof event.newValue !== 'string') {
      return;
    }
    const incomingState = parsePersistedState(event.newValue, parseState);
    if (!incomingState || !shouldAcceptIncomingState(getState(), incomingState)) {
      return;
    }
    setState(incomingState);
    render();
    onStatus?.('Updated from another window.');
  };

  environment.addEventListener('storage', listener);
  return () => environment.removeEventListener?.('storage', listener);
}

export function writeStateAcrossWindows({
  storageKey,
  storage,
  state,
  parseState,
  serializeState,
  markStateUpdated,
  now = () => new Date().toISOString(),
}) {
  const storedState = parsePersistedState(storage.getItem(storageKey), parseState);
  if (storedState && shouldAcceptIncomingState(state, storedState)) {
    return { action: 'accepted-existing', state: storedState };
  }

  const updatedState = markStateUpdated(state, now());
  storage.setItem(storageKey, serializeState(updatedState));
  return { action: 'saved', state: updatedState };
}

function parsePersistedState(raw, parseState) {
  if (!raw || !hasPersistedStateShape(raw)) {
    return undefined;
  }
  return parseState(raw);
}

function hasPersistedStateShape(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.sessions) && parsed.sessions.length > 0;
  } catch {
    return false;
  }
}

function collectLatestTimestamp(value, seen = new Set()) {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  if (seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.reduce((latest, item) => maxTimestamp(latest, collectLatestTimestamp(item, seen)), undefined);
  }

  return Object.entries(value).reduce((latest, [key, item]) => {
    if (key.endsWith('At') && typeof item === 'string') {
      return maxTimestamp(latest, Date.parse(item));
    }
    return maxTimestamp(latest, collectLatestTimestamp(item, seen));
  }, undefined);
}

function maxTimestamp(left, right) {
  const normalizedRight = Number.isFinite(right) ? right : undefined;
  if (left === undefined) {
    return normalizedRight;
  }
  if (normalizedRight === undefined) {
    return left;
  }
  return Math.max(left, normalizedRight);
}

function stableStateString(value) {
  return JSON.stringify(sortForStableString(value));
}

function sortForStableString(value) {
  if (Array.isArray(value)) {
    return value.map(sortForStableString);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, sortForStableString(value[key])]),
  );
}
